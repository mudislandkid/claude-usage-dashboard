#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod menu;
mod sidecar;
mod splash;

use sidecar::{start_sidecar, stop_sidecar, SidecarState};
use tauri::{Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    let app = tauri::Builder::default()
        .manage(SidecarState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .menu(|app| menu::build(app))
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "reload" => {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.eval("window.location.reload()");
                    }
                }
                "github" => {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = app
                        .opener()
                        .open_url("https://github.com/Mudislandkid/claude-usage-dashboard", None::<&str>);
                }
                _ => {}
            }
        })
        .setup(|app| {
            // Show the splash immediately so the user sees the logo + "Starting…"
            // label instead of an empty white window while the sidecar boots.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.navigate(splash::data_url().parse().unwrap());
                let _ = win.show();
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match start_sidecar(&handle).await {
                    Ok(port) => {
                        let url = format!("http://127.0.0.1:{port}/");
                        tracing::info!("navigating webview to {url}");
                        if let Some(win) = handle.get_webview_window("main") {
                            let _ = win.navigate(url.parse().unwrap());
                        }
                    }
                    Err(e) => {
                        tracing::error!("sidecar startup failed: {e}");
                        if let Some(win) = handle.get_webview_window("main") {
                            let html = format!(
                                "<html><body style='font-family:system-ui;padding:32px;background:#0a0a0a;color:#fff'>\
                                 <h1>Failed to start backend</h1><pre>{e}</pre></body></html>"
                            );
                            let data_url = format!("data:text/html;base64,{}", base64_encode_bytes(html.as_bytes()));
                            let _ = win.navigate(data_url.parse().unwrap());
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state: tauri::State<SidecarState> = window.state();
                stop_sidecar(&state);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            let state: tauri::State<SidecarState> = handle.state();
            stop_sidecar(&state);
        }
    });
}

pub(crate) fn base64_encode_bytes(bytes: &[u8]) -> String {
    use std::fmt::Write;
    const ALPHA: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied().unwrap_or(0);
        let b2 = chunk.get(2).copied().unwrap_or(0);
        let n = ((b0 as u32) << 16) | ((b1 as u32) << 8) | (b2 as u32);
        let _ = write!(out, "{}", ALPHA[((n >> 18) & 0x3f) as usize] as char);
        let _ = write!(out, "{}", ALPHA[((n >> 12) & 0x3f) as usize] as char);
        if chunk.len() > 1 {
            let _ = write!(out, "{}", ALPHA[((n >> 6) & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            let _ = write!(out, "{}", ALPHA[(n & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}
