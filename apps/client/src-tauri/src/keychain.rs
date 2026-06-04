// OS-keychain bindings exposed as Tauri invoke handlers (v0.3 P2).
//
// JS layer (apps/client/src/lib/keychain-pairing-storage.ts) calls these three
// commands. Errors that mean "no backend" come back to JS as
// `KeychainError::Unavailable("...")` so the storage layer can switch to the
// plain-file fallback with a visible warning instead of failing the pairing
// flow outright.

use keyring::{Entry, Error as KeyringError};
use serde::Serialize;

const SERVICE: &str = "devgarden-client";
const ACCOUNT: &str = "pairing-jwt";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeychainError {
    pub kind: KeychainErrorKind,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum KeychainErrorKind {
    /// No backend on this host (libsecret missing, locked, etc.). JS falls
    /// back to plain-file storage.
    Unavailable,
    /// Backend exists but the call failed (permission denied, corrupted
    /// entry, etc.). JS surfaces a warning but does not silently fall back.
    Failed,
}

impl From<KeyringError> for KeychainError {
    fn from(err: KeyringError) -> Self {
        let message = err.to_string();
        let kind = match err {
            KeyringError::NoStorageAccess(_) | KeyringError::PlatformFailure(_) => {
                KeychainErrorKind::Unavailable
            }
            _ => KeychainErrorKind::Failed,
        };
        KeychainError { kind, message }
    }
}

fn entry() -> Result<Entry, KeychainError> {
    Entry::new(SERVICE, ACCOUNT).map_err(Into::into)
}

#[tauri::command]
pub fn keychain_get() -> Result<Option<String>, KeychainError> {
    let e = entry()?;
    match e.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(err) => Err(err.into()),
    }
}

#[tauri::command]
pub fn keychain_set(value: String) -> Result<(), KeychainError> {
    entry()?.set_password(&value).map_err(Into::into)
}

#[tauri::command]
pub fn keychain_delete() -> Result<(), KeychainError> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(err) => Err(err.into()),
    }
}

/// Reads DEVGARDEN_PAIRING_STORAGE. When set to "file" the JS storage
/// router skips the keychain probe entirely and uses the legacy file
/// backend — escape hatch for headless / sandboxed environments.
#[tauri::command]
pub fn pairing_storage_override() -> String {
    std::env::var("DEVGARDEN_PAIRING_STORAGE").unwrap_or_default()
}
