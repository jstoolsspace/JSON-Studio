//! Tauri host for JSTools JSON Studio.
//!
//! Thin layer around the `json-core` engine: owns the memory-mapped bytes and
//! the parsed index per open document, and exposes a small, validated command
//! surface to the UI.

mod commands;
mod paths;
mod recent;
mod settings;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            // File watching is best-effort; a failure here must not block startup.
            if let Err(e) = commands::init_watcher(app.handle()) {
                eprintln!("file watcher init failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::is_portable,
            commands::open_document,
            commands::open_text,
            commands::update_text,
            commands::close_document,
            commands::get_metadata,
            commands::get_tree_window,
            commands::set_node_expanded,
            commands::set_subtree_expanded,
            commands::expand_to_depth,
            commands::collapse_all,
            commands::get_node_value,
            commands::get_node_path,
            commands::reveal_node,
            commands::get_raw_lines,
            commands::run_search,
            commands::run_query,
            commands::format_document,
            commands::export_query,
            commands::save_text,
            commands::recent_list,
            commands::recent_add,
            commands::recent_remove,
            commands::recent_toggle_pin,
            commands::recent_clear,
            commands::reload_document,
            commands::run_diff,
            commands::jsonl_fields,
            commands::jsonl_window,
            commands::settings_load,
            commands::settings_save,
            commands::set_query_limit,
            commands::session_load,
            commands::session_save,
        ])
        .run(tauri::generate_context!())
        .expect("error while running JSON Studio");
}
