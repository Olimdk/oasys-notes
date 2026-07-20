use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct SyncConfig {
    pub mode: String,      // "local" | "smb" | "webdav" | "server"
    pub remote: String,    // mount path or URL
    pub connected: bool,
}

static mut SYNC: Option<SyncConfig> = None;

#[tauri::command]
pub fn sync_configure(mode: String, remote: String) -> Result<(), String> {
    unsafe { SYNC = Some(SyncConfig { mode, remote, connected: false }); }
    Ok(())
}

#[tauri::command]
pub fn sync_status() -> Result<SyncConfig, String> {
    unsafe {
        Ok(SYNC.clone().unwrap_or(SyncConfig { mode: "local".into(), remote: "".into(), connected: true }))
    }
}

#[tauri::command]
pub fn sync_push() -> Result<String, String> {
    // TODO: offline queue -> remote push (SMB/WebDAV/server)
    Ok("sync_push: not yet implemented".into())
}

#[tauri::command]
pub fn sync_pull() -> Result<String, String> {
    // TODO: remote -> local pull
    Ok("sync_pull: not yet implemented".into())
}
