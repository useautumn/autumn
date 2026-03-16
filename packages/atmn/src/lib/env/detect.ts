/**
 * Environment detection and key validation utilities
 */

/**
 * Application environment enum
 * Matches the canonical AppEnv enum from shared/models
 */
export enum AppEnv {
	Sandbox = "sandbox",
	Live = "live",
}

/**
 * Detect environment from API key format
 * Sandbox keys contain '_test_', live keys contain '_live_'
 */
export function getEnvironmentFromKey(key: string): AppEnv {
	if (key.includes("_test_")) {
		return AppEnv.Sandbox;
	}
	if (key.includes("_live_")) {
		return AppEnv.Live;
	}
	throw new Error(
		`Invalid API key format: must contain '_test_' (sandbox) or '_live_' (live)`,
	);
}

/**
 * Check if key is a sandbox key
 */
export function isSandboxKey(key: string): boolean {
	return key.includes("_test_");
}

/**
 * Check if key is a live/production key
 */
export function isLiveKey(key: string): boolean {
	return key.includes("_live_");
}

/**
 * Validate key format (basic check)
 */
export function isValidKey(key: string): boolean {
	return (
		typeof key === "string" &&
		key.length > 0 &&
		(isSandboxKey(key) || isLiveKey(key))
	);
}
