import { AppEnv, isValidKey } from "./detect.js";
import { getDotenvValue } from "./dotenv.js";

/**
 * API key management utilities
 */

export interface ApiKeys {
	[AppEnv.Sandbox]?: string;
	[AppEnv.Live]?: string;
}

/**
 * Read API keys from .env files
 * Returns keys organized by environment
 *
 * Checks both the specified cwd AND process.cwd() (root) to handle monorepo cases
 * where .env might be at the root but output goes to a subdirectory.
 *
 * Standard naming convention:
 * - AUTUMN_SECRET_KEY: sandbox key (am_sk_test_* prefix)
 * - AUTUMN_PROD_SECRET_KEY: production/live key (am_sk_live_* prefix)
 */
export function readApiKeys(cwd?: string): ApiKeys {
	const keys: ApiKeys = {};
	const rootCwd = process.cwd();

	// Helper to get value from cwd first, then fallback to root
	const getValue = (key: string): string | undefined => {
		if (cwd && cwd !== rootCwd) {
			// Try specified cwd first
			const value = getDotenvValue(key, cwd);
			if (value) return value;
		}
		// Fallback to root cwd
		return getDotenvValue(key, rootCwd);
	};

	const autumnSecretKey = getValue("AUTUMN_SECRET_KEY");
	const autumnProdSecretKey = getValue("AUTUMN_PROD_SECRET_KEY");

	// AUTUMN_SECRET_KEY is always sandbox (ask_* prefix)
	if (autumnSecretKey && isValidKey(autumnSecretKey)) {
		keys[AppEnv.Sandbox] = autumnSecretKey;
	}

	// AUTUMN_PROD_SECRET_KEY is always production/live (apks_* prefix)
	if (autumnProdSecretKey && isValidKey(autumnProdSecretKey)) {
		keys[AppEnv.Live] = autumnProdSecretKey;
	}

	return keys;
}

/**
 * Get API key for specific environment
 * Throws if key is not found
 */
export function getKey(env: AppEnv, cwd?: string): string {
	const keys = readApiKeys(cwd);
	const key = keys[env];

	if (!key) {
		throw new Error(
			`No ${env} API key found. Run 'atmn login' to authenticate.`,
		);
	}

	return key;
}

/**
 * Check if API key exists for environment
 */
export function hasKey(env: AppEnv, cwd?: string): boolean {
	const keys = readApiKeys(cwd);
	return !!keys[env];
}

/**
 * Get any available key (prefers sandbox)
 */
export function getAnyKey(cwd?: string): string | undefined {
	const keys = readApiKeys(cwd);
	return keys[AppEnv.Sandbox] || keys[AppEnv.Live];
}
