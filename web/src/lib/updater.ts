// Auto-update check for the Tauri-packaged app.
// In browser mode (no Tauri runtime present), this is a no-op.
//
// Verbose console logging with the [updater] prefix so you can trace each
// step in the WKWebView devtools. User-facing dialogs use the Tauri dialog
// plugin — NOT window.confirm/window.alert, which are silent no-ops in the
// wry/WKWebView (confirm() returns false instantly, so the old code treated
// every update as "declined" and never installed).

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

  // Native dialogs (real modals that return real booleans). Loaded here rather
  // than at module top so browser/dev mode stays a clean no-op above.
  const { ask, message } = await import('@tauri-apps/plugin-dialog');

  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();

    if (!update) {
      console.info(`${TAG} no update available — current ${APP_VERSION} is latest`);
      if (opts.manual) {
        await message(`You're on the latest version (${APP_VERSION}).`, {
          title: 'Claude Usage Dashboard',
          kind: 'info',
        });
      }
      return;
    }

    console.info(`${TAG} update available: v${update.version}`);

    const proceed = await ask(
      (update.body ? `${update.body}\n\n` : '') +
        'Download and install now? The app will restart.',
      {
        title: `Update available: v${update.version}`,
        kind: 'info',
        okLabel: 'Install & Restart',
        cancelLabel: 'Later',
      },
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
    // Loud dialog so updater failures are visible without opening devtools.
    await message(
      `Update check failed.\n\n${msg}\n\n(Open the inspector and check the [updater] console logs for full details.)`,
      { title: 'Update check failed', kind: 'error' },
    );
  }
}

// Expose for manual triggering from native menu / devtools.
if (typeof window !== 'undefined') {
  (window as unknown as { cudCheckForUpdates: () => void }).cudCheckForUpdates =
    () => void checkForUpdates({ manual: true });
}
