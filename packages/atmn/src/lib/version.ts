/**
 * Application version - injected at build time via bundler define
 */
declare const VERSION: string;

/**
 * Get the current application version
 * Falls back to "dev" if VERSION is not defined (e.g., during development)
 */
export const APP_VERSION: string =
	typeof VERSION !== "undefined" && VERSION ? VERSION : "dev";
