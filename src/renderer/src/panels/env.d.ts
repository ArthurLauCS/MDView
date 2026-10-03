/**
 * Injected by the renderer build from package.json, so the version shown in
 * the settings panel cannot drift from the one that shipped.
 * Declared here rather than in a global .d.ts because only this directory
 * consumes it.
 */
declare const __APP_VERSION__: string
