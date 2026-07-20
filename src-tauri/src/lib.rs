mod vault;
mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            vault::vault_open,
            vault::vault_tree,
            vault::vault_index,
            vault::vault_read,
            vault::vault_write,
            vault::vault_create,
            vault::vault_patch,
            vault::vault_delete,
            vault::vault_rename,
            vault::vault_graph,
            vault::vault_backlinks,
            sync::sync_configure,
            sync::sync_status,
            sync::sync_push,
            sync::sync_pull
        ])
        .run(tauri::generate_context!())
        .expect("error while running OASYS Notes");
}
