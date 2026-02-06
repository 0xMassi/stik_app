use crate::commands::settings;
use crate::windows::{show_folder_selector, show_postit_with_folder};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::App;

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let quit = MenuItem::with_id(app, "quit", "Quit Stik", true, None::<&str>)?;
    let new_note = MenuItem::with_id(app, "new_note", "New Note (⌘⇧S)", true, None::<&str>)?;
    let folder_selector = MenuItem::with_id(
        app,
        "folder_selector",
        "Select Folder (⌘⇧F)",
        true,
        None::<&str>,
    )?;

    let menu = Menu::with_items(app, &[&new_note, &folder_selector, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "new_note" => {
                let settings = settings::get_settings().unwrap_or_default();
                show_postit_with_folder(app, &settings.default_folder);
            }
            "folder_selector" => {
                show_folder_selector(app);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
