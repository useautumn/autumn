import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

/**
 * Singleton browser pool for reusing Puppeteer browser instances across tests.
 * This reduces overhead from launching/closing browsers repeatedly.
 */
class BrowserPool {
	private browser: Browser | null = null;
	private initPromise: Promise<Browser> | null = null;

	/** Get or create the shared browser instance */
	async getBrowser(): Promise<Browser> {
		if (this.browser?.connected) return this.browser;

		// Avoid race conditions - only one init at a time
		if (this.initPromise) return this.initPromise;

		this.initPromise = puppeteer
			.launch({
				headless: true,
				executablePath: process.env.TESTS_CHROMIUM_PATH,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
					"--disable-gpu",
				],
			})
			.then((browser) => {
				this.browser = browser;
				this.initPromise = null;
				return browser;
			});

		return this.initPromise;
	}

	/** Create a new page (tab) in the shared browser */
	async newPage(): Promise<Page> {
		const browser = await this.getBrowser();
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		return page;
	}

	/** Close the shared browser (call at end of test suite if needed) */
	async close(): Promise<void> {
		if (this.browser?.connected) {
			await this.browser.close();
			this.browser = null;
		}
	}
}

// Export singleton instance
export const browserPool = new BrowserPool();
