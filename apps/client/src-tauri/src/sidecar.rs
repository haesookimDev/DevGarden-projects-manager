// Spawns + supervises the Node sidecar that actually runs harnesses.
//
// The sidecar bundle (apps/client-runner/dist/runner.js) is copied into
// src-tauri/resources/runner.js at `pnpm prepare:sidecar` time and shipped
// inside the Tauri app via `bundle.resources`. At runtime we resolve that
// resource path, spawn `node <path>` with stdin/stdout piped, and forward
// every JSON line the child writes back to the webview as a `sidecar:event`
// Tauri event so the existing pairing UI can display status.
//
// Node bundling decision: the sidecar uses the operator's system `node`
// (see docs/roadmap/v0.2/N2-node-sidecar-runner.md). Shipping prebuilt Node
// stays deferred — keeps DMG/MSI size unchanged.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State};

/// Channel name on which sidecar lifecycle / status JSON lines surface to
/// the webview. Each event carries the raw object the sidecar wrote.
const SIDECAR_EVENT: &str = "sidecar:event";

/// Active child process + its stdin. Wrapped in a Mutex so the two Tauri
/// commands (start / stop) can safely race.
#[derive(Default)]
pub struct SidecarState(pub Mutex<Option<Running>>);

pub struct Running {
    child: Child,
    // Held alive so the bootstrap line stays delivered; subsequent IPC
    // (post-PR5) can reuse this handle to push commands.
    stdin: ChildStdin,
}

/// Tauri command: webview asks the host to spawn the sidecar with the
/// pairing's apiBaseUrl + jwt. Replaces any previously running instance.
#[tauri::command]
pub fn start_sidecar(
    app: AppHandle,
    state: State<'_, SidecarState>,
    api_base_url: String,
    jwt: String,
) -> Result<(), String> {
    // Stop any existing one first so a re-pair triggers a clean restart.
    stop_inner(&state);

    let runner = app
        .path()
        .resolve("resources/runner.js", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resolve runner.js: {e}"))?;

    let mut cmd = Command::new("node");
    cmd.arg(&runner)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn node {}: {e}", runner.display()))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "sidecar stdin not piped".to_string())?;

    let bootstrap = json!({ "apiBaseUrl": api_base_url, "jwt": jwt }).to_string();
    writeln!(stdin, "{bootstrap}").map_err(|e| format!("write bootstrap: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sidecar stdout not piped".to_string())?;

    // Forward each stdout JSON line to the webview. Non-JSON lines (rare —
    // a panic banner from Node) get wrapped so they still surface.
    let app_for_thread = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let payload: serde_json::Value =
                serde_json::from_str(trimmed).unwrap_or_else(|_| json!({"raw": trimmed}));
            let _ = app_for_thread.emit(SIDECAR_EVENT, payload);
        }
        // Reader EOF means the child closed stdout (exited or piped closed).
        let _ = app_for_thread.emit(SIDECAR_EVENT, json!({"type": "sidecar:eof"}));
    });

    // Same fan-out for stderr — surfaced as a separate sub-type so the
    // webview can colour it differently.
    if let Some(stderr) = child.stderr.take() {
        let app_for_thread = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                let _ = app_for_thread
                    .emit(SIDECAR_EVENT, json!({"type": "sidecar:stderr", "line": line}));
            }
        });
    }

    *state.0.lock().unwrap() = Some(Running { child, stdin });
    Ok(())
}

/// Tauri command: kill the sidecar (on unpair / app exit). Returns Ok even
/// when nothing was running so the webview can call it defensively.
#[tauri::command]
pub fn stop_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    stop_inner(&state);
    Ok(())
}

fn stop_inner(state: &State<'_, SidecarState>) {
    if let Some(mut running) = state.0.lock().unwrap().take() {
        // Best-effort kill — even if Node ignored SIGTERM, the Child drop
        // would orphan the process; explicit kill avoids that.
        let _ = running.child.kill();
        let _ = running.child.wait();
        // stdin handle goes with `running` — explicit drop for clarity.
        drop(running.stdin);
    }
}
