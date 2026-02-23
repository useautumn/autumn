import { afterAll } from "bun:test";
import { type Browser, chromium } from "playwright-core";
import { CHROMIUM_PATH, HEADLESS } from "./browserConfig.js";

/**
 * Singleton Playwright browser pool for local development.
 * Manages a single Chromium instance with on-demand browser contexts.
 *
 * Each call to runInPage() gets an isolated page that is automatically closed
 * after the function completes, keeping the browser open for reuse.
 */
class PlaywrightPool {
	private browser: Browser | null = null;
	private initPromise: Promise<Browser> | null = null;

	/** Get or launch the shared Chromium browser */
	private async getBrowser(): Promise<Browser> {
		if (this.browser?.isConnected()) return this.browser;

		// Coalesce concurrent callers on the same init promise
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			console.log("[PlaywrightPool] Launching local Chromium...");
			const browser = await chromium.launch({
				headless: HEADLESS,
				executablePath: CHROMIUM_PATH,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
					"--disable-gpu",
				],
			});
			this.browser = browser;
			this.initPromise = null;
			console.log("[PlaywrightPool] Chromium launched");
			return browser;
		})();

		return this.initPromise;
	}

	/**
	 * Run a self-contained function with an isolated Playwright page.
	 * Creates a new context + page, calls the function, then closes both.
	 */
	async runInPage({
		fn,
		args,
	}: {
		// biome-ignore lint/suspicious/noExplicitAny: must accept any self-contained playwright function
		fn: (params: any) => Promise<any>;
		args: Record<string, unknown>;
	}): Promise<void> {
		const browser = await this.getBrowser();
		const context = await browser.newContext({
			viewport: { width: 1280, height: 800 },
		});
		const page = await context.newPage();

		try {
			await fn({ page, ...args });
		} finally {
			await page.close();
			await context.close();
		}
	}

	/** Close the shared browser */
	async close(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}
}

export const playwrightPool = new PlaywrightPool();

// Auto-cleanup when test file finishes
afterAll(async () => {
	await playwrightPool.close();
});
