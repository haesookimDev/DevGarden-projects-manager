// Entry point for the Node sidecar that the Tauri client spawns.
//
// In N2 PR1 (this commit) the sidecar is a placeholder that just prints a
// hello line on startup so we can verify the build pipeline ships a working
// CJS binary. The real wiring lands one piece per follow-up PR:
//
//   PR2 — move apps/client tools + run-executor in here.
//   PR3 — stdin bootstrap (apiBaseUrl + jwt) + socket.io heartbeat.
//   PR4 — run:start handler that calls executeRun.
//   PR5 — Tauri Rust spawns the sidecar via tauri.conf externalBin.

function main(): void {
  const ts = new Date().toISOString();
  process.stdout.write(
    JSON.stringify({ type: 'sidecar:hello', pid: process.pid, node: process.version, ts }) + '\n',
  );
}

main();
