// Auto-update check for the Tauri-packaged app.
// In browser mode (no Tauri runtime present), this is a no-op.
//
// Verbose console logging with the [updater] prefix so you can trace each
// step in the WKWebView devtools. Errors raise window.alert so they're
// visible without opening the inspector.

import { APP_VERSION } from './version';

const TAG = '[updater]';

export async function checkForUpdates(opts: { manual?: boolean } = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  // Tauri 2.x injects this. If absent, we're in browser dev mode.
  if (!('__TAURI_INTERNALS__' in window)) {
    console.info(`${TAG} browser mode (no __TAURI_INTERNALS__) — skipping check`);
    return;
  }

  console.info(`${TAG} running check (current ${APP_VERSION})`);

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update) {
      console.info(`${TAG} no update available — current ${APP_VERSION} is latest`);
      if (opts.manual) {
        window.alert(`You're on the latest version (${APP_VERSION}).`);
      }
      return;
    }

    console.info(`${TAG} update available: v${update.version}`);

    const proceed = window.confirm(
      `An update is available: v${update.version}\n\n` +
        (update.body ? `${update.body}\n\n` : '') +
        'Download and install now? The app will restart.',
    );
    if (!proceed) {
      console.info(`${TAG} user declined update`);
      return;
    }

    console.info(`${TAG} downloading + installing...`);
    await update.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    console.info(`${TAG} install complete, relaunching`);
    await relaunch();
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`${TAG} check failed:`, err);
    // Loud alert so we can see updater failures without opening devtools.
    window.alert(`Update check failed.\n\n${msg}\n\n(Open the inspector and check the [updater] console logs for full details.)`);
  }
}

// Expose for manual triggering from native menu / devtools.
if (typeof window !== 'undefined') {
  (window as unknown as { cudCheckForUpdates: () => void }).cudCheckForUpdates =
    () => void checkForUpdates({ manual: true });
}
