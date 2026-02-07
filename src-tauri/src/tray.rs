use crate::commands::{settings, stats};
use crate::windows::show_postit_with_folder;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::App;

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let streak_days = stats::calculate_and_persist_capture_streak().unwrap_or_else(|e| {
        eprintln!("Failed to compute capture streak: {}", e);
        0
    });
    let streak_label = stats::format_capture_streak_label(streak_days);

    let quit = MenuItem::with_id(app, "quit", "Quit Stik", true, None::<&str>)?;
    let new_note = MenuItem::with_id(app, "new_note", "New Note", true, None::<&str>)?;
    let capture_streak =
        MenuItem::with_id(app, "capture_streak", &streak_label, false, None::<&str>)?;

    let menu = Menu::with_items(app, &[&new_note, &capture_streak, &quit])?;

    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;

    let _tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "new_note" => {
                let settings = settings::get_settings().unwrap_or_default();
                show_postit_with_folder(app, &settings.default_folder);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
