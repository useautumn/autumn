import "dotenv/config";

// ============================================================================
// Browser test configuration — toggle these for local development / debugging
// ============================================================================

/** Use Kernel cloud browsers instead of local Chromium */
export const USE_KERNEL = !!process.env.USE_KERNEL_BROWSER;
// export const USE_KERNEL = false;

/** Run browsers in headless mode (set false to watch the browser) */
export const HEADLESS = true;

/** Path to local Chromium/Chrome executable (auto-detected if not set in env) */
export const CHROMIUM_PATH =
	process.env.TESTS_CHROMIUM_PATH || "/opt/homebrew/bin/chromium";

/** Kernel browser session timeout in seconds */
export const KERNEL_TIMEOUT_SECONDS = 30;

/** Kernel Playwright execution timeout in seconds */
export const KERNEL_EXECUTE_TIMEOUT_SEC = 120;
