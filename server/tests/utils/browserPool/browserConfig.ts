import "dotenv/config";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

// ============================================================================
// Browser test configuration — toggle these for local development / debugging
// ============================================================================

/** Use Kernel cloud browsers instead of local Chromium */
export const USE_KERNEL = !!process.env.USE_KERNEL_BROWSER;
// export const USE_KERNEL = false;

/** Run browsers in headless mode (set false to watch the browser) */
export const HEADLESS = true;

/** Path to local Chromium/Chrome executable (env → playwright-core → fallback).
 * The env path is machine-specific (shared Infisical) — honored only if it exists. */
const resolveChromiumPath = (): string => {
	const fromEnv = process.env.TESTS_CHROMIUM_PATH;
	if (fromEnv && existsSync(fromEnv)) return fromEnv;
	try {
		const resolved = chromium.executablePath();
		if (existsSync(resolved)) return resolved;
	} catch {
		// fall through
	}
	return fromEnv || "/opt/homebrew/bin/chromium";
};
export const CHROMIUM_PATH = resolveChromiumPath();

/** Kernel browser session timeout in seconds */
export const KERNEL_TIMEOUT_SECONDS = 30;

/** Kernel Playwright execution timeout in seconds */
export const KERNEL_EXECUTE_TIMEOUT_SEC = 120;
