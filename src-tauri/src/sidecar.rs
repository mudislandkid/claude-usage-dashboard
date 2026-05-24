use std::sync::Mutex;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::oneshot;
use tokio::time::timeout;

/// Holds the running sidecar process so we can kill it on app exit.
pub struct SidecarState {
    pub child: Mutex<Option<CommandChild>>,
    pub port: Mutex<Option<u16>>,
    pub reader: Mutex<Option<JoinHandle<()>>>,
}

impl SidecarState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(None),
            reader: Mutex::new(None),
        }
    }
}

/// Spawn the Node sidecar and wait until it prints `READY <port>` on stdout.
/// Returns the port the server is listening on.
pub async fn start_sidecar<R: Runtime>(app: &AppHandle<R>) -> Result<u16, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir failed: {e}"))?;
    let server_entry = resource_dir.join("server").join("index.js");
    if !server_entry.exists() {
        return Err(format!(
            "server entrypoint not found at {}",
            server_entry.display()
        ));
    }

    let (mut rx, child) = app
        .shell()
        .sidecar("cud-server")
        .map_err(|e| format!("sidecar() failed: {e}"))?
        .args([server_entry.to_string_lossy().to_string()])
        .env("CUD_BUNDLED", "1")
        .spawn()
        .map_err(|e| format!("sidecar spawn failed: {e}"))?;

    let (port_tx, port_rx) = oneshot::channel::<u16>();
    let mut port_tx = Some(port_tx);

    let reader_handle = tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let s = String::from_utf8_lossy(&line);
                    tracing::info!(target: "sidecar", "{s}");
                    if let Some(port_str) = s.trim().strip_prefix("READY ") {
                        if let (Ok(port), Some(tx)) = (port_str.parse::<u16>(), port_tx.take()) {
                            let _ = tx.send(port);
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    tracing::warn!(target: "sidecar", "{}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(e) => {
                    tracing::error!(target: "sidecar", "error: {e}");
                }
                CommandEvent::Terminated(payload) => {
                    tracing::info!(target: "sidecar", "terminated: {:?}", payload);
                    break;
                }
                _ => {}
            }
        }
    });

    let port = timeout(Duration::from_secs(15), port_rx)
        .await
        .map_err(|_| "timed out waiting for sidecar READY".to_string())?
        .map_err(|_| "sidecar exited before READY".to_string())?;

    let state: tauri::State<SidecarState> = app.state();
    *state.child.lock().unwrap() = Some(child);
    *state.port.lock().unwrap() = Some(port);
    *state.reader.lock().unwrap() = Some(reader_handle);

    Ok(port)
}

/// Kill the sidecar gracefully (SIGTERM, then SIGKILL after 2s).
pub fn stop_sidecar(state: &SidecarState) {
    let mut guard = state.child.lock().unwrap();
    if let Some(child) = guard.take() {
        let pid = child.pid();
        tracing::info!(target: "sidecar", "stopping pid {pid}");
        // tauri_plugin_shell::process::CommandChild::kill() sends SIGKILL on Unix.
        // We don't have a clean SIGTERM API here, so we send SIGTERM via libc directly,
        // wait briefly, then kill() as a fallback.
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(pid as libc::pid_t, libc::SIGTERM);
            }
            std::thread::sleep(Duration::from_millis(2000));
        }
        let _ = child.kill();
    }
}
