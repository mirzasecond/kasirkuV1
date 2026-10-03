use tauri::Manager;
use std::sync::Mutex;
use lazy_static::lazy_static;

lazy_static! {
    static ref DB_HANDLE: Mutex<Option<kasirku_lib::Database>> = Mutex::new(None);
}

#[tauri::command]
fn initialize_db() -> Result<(), String> {
    let mut handle = DB_HANDLE.lock().map_err(|e| e.to_string())?;
    *handle = Some(kasirku_lib::Database::new());
    Ok(())
}

fn get_db() -> Result<kasirku_lib::Database, String> {
    let handle = DB_HANDLE.lock().map_err(|e| e.to_string())?;
    handle.as_ref().cloned().ok_or_else(|| "Database not initialized".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            initialize_db,
            // Add more commands here
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
