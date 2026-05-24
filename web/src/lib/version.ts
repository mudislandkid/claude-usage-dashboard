// Version string injected at build time from web/package.json via vite.config.ts.
// Same value as the root package.json (versions are kept in lockstep).
declare const __APP_VERSION__: string;

export const APP_VERSION = `v${__APP_VERSION__}`;
