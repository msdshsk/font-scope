use font_kit::family_name::FamilyName;
use font_kit::properties::Properties;
use font_kit::source::SystemSource;
use std::env;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    match env::current_exe() {
        Ok(exe_path) => {
            if let Some(exe_dir) = exe_path.parent() {
                Ok(exe_dir.to_string_lossy().to_string())
            } else {
                Err("Failed to get parent directory".to_string())
            }
        }
        Err(e) => Err(format!("Failed to get exe path: {}", e)),
    }
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let mut fonts = Vec::new();

    // システムフォントファミリーを列挙
    if let Ok(families) = source.all_families() {
        fonts = families;
        fonts.sort();
    }

    fonts
}

#[tauri::command]
fn get_font_family_name(font_name: &str) -> Option<String> {
    let source = SystemSource::new();

    // フォントファミリー名を取得
    match source.select_best_match(
        &[FamilyName::Title(font_name.to_string())],
        &Properties::new(),
    ) {
        Ok(_) => Some(font_name.to_string()),
        Err(_) => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![greet, get_system_fonts, get_font_family_name, get_exe_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
