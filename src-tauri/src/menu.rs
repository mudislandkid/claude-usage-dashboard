use tauri::menu::{
    AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("Claude Usage Dashboard"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .website(Some("https://github.com/Mudislandkid/claude-usage-dashboard"))
        .website_label(Some("GitHub"))
        .build();

    let check_updates = MenuItemBuilder::with_id("check_updates", "Check for Updates\u{2026}").build(app)?;

    let app_submenu = SubmenuBuilder::new(app, "Claude Usage Dashboard")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About Claude Usage Dashboard"),
            Some(about_metadata),
        )?)
        .separator()
        .item(&check_updates)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let reload = MenuItemBuilder::with_id("reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;

    let view_submenu = SubmenuBuilder::new(app, "View")
        .item(&reload)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?)
        .build()?;

    let window_submenu = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    let help_item = MenuItemBuilder::with_id("github", "View on GitHub").build(app)?;
    let help_submenu = SubmenuBuilder::new(app, "Help").item(&help_item).build()?;

    MenuBuilder::new(app)
        .item(&app_submenu)
        .item(&edit_submenu)
        .item(&view_submenu)
        .item(&window_submenu)
        .item(&help_submenu)
        .build()
}
