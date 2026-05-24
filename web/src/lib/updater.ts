// Auto-update check for the Tauri-packaged app.
// In browser mode (no Tauri runtime present), this is a no-op.

export async function checkForUpdates(): Promise<void> {
  if (typeof window === 'undefined') return;
  // Tauri 2.x injects this. If absent, we're in browser dev mode.
  if (!('__TAURI_INTERNALS__' in window)) return;

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return;

    const proceed = window.confirm(
      `An update is available: v${update.version}\n\n` +
        (update.body ? `${update.body}\n\n` : '') +
        'Download and install now? The app will restart.',
    );
    if (!proceed) return;

    await update.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    console.warn('[updater] check failed:', err);
  }
}
