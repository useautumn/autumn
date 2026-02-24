import { afterAll } from "bun:test";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { CHROMIUM_PATH, HEADLESS } from "./browserConfig.js";
import {
	createKernelBrowser,
	createKernelSession,
	deleteKernelSession,
	kernel,
} from "./kernelBrowser.js";

export type IsolatedBrowser = {
	browser: Browser;
	sessionId: string | null;
	/** Disconnect/close the browser and delete the Kernel session if applicable */
	cleanup: () => Promise<void>;
};

const CDP_CONNECT_MAX_ATTEMPTS = 4;
const CDP_CONNECT_BASE_DELAY_MS = 2000;
const KERNEL_STARTUP_DELAY_MS = 2000;

/** Create a new browser instance (Kernel CDP or local Chromium) */
const createBrowser = async (): Promise<{
	browser: Browser;
	sessionId: string | null;
}> => {
	if (kernel) {
		const { sessionId, cdpWsUrl } = await createKernelBrowser();

		// Give Chrome inside the Kernel container time to bind to the CDP port
		await new Promise((r) => setTimeout(r, KERNEL_STARTUP_DELAY_MS));

		// Retry CDP connection with exponential backoff
		let browser: Browser | null = null;
		for (let attempt = 0; attempt < CDP_CONNECT_MAX_ATTEMPTS; attempt++) {
			try {
				browser = await puppeteer.connect({
					browserWSEndpoint: cdpWsUrl,
				});
				break;
			} catch (err) {
				if (attempt === CDP_CONNECT_MAX_ATTEMPTS - 1) {
					console.error(
						`[BrowserPool] CDP connect failed after ${CDP_CONNECT_MAX_ATTEMPTS} attempts, giving up`,
					);
					await deleteKernelSession({ sessionId });
					throw err;
				}
				const delay = CDP_CONNECT_BASE_DELAY_MS * 2 ** attempt;
				console.log(
					`[BrowserPool] CDP connect failed (attempt ${attempt + 1}/${CDP_CONNECT_MAX_ATTEMPTS}), retrying in ${delay}ms...`,
				);
				await new Promise((r) => setTimeout(r, delay));
			}
		}

		console.log("[BrowserPool] Puppeteer connected via CDP");
		return { browser: browser!, sessionId };
	}

	console.log("[BrowserPool] Launching local Chromium...");
	const browser = await puppeteer.launch({
		headless: HEADLESS,
		executablePath: CHROMIUM_PATH,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-gpu",
		],
	});
	return { browser, sessionId: null };
};

/** Cleanup a browser instance — disconnect+delete for Kernel, close for local */
const cleanupBrowser = async ({
	browser,
	sessionId,
}: {
	browser: Browser;
	sessionId: string | null;
}) => {
	if (browser.connected) {
		if (sessionId) {
			browser.disconnect();
		} else {
			await browser.close();
		}
	}

	if (sessionId) {
		await deleteKernelSession({ sessionId });
	}
};

/**
 * Singleton browser pool for reusing Puppeteer browser instances across tests.
 * Supports both local Chromium and Kernel cloud browsers.
 *
 * For V2 helpers using Kernel Playwright Execution, use getSessionId()
 * to get a Kernel session without establishing a CDP connection.
 */
class BrowserPool {
	private browser: Browser | null = null;
	private sessionId: string | null = null;
	private initPromise: Promise<Browser> | null = null;
	private sessionIdPromise: Promise<string> | null = null;

	/** Get a Kernel session ID (no CDP). Used by V2 Playwright execution helpers. */
	async getSessionId(): Promise<string> {
		if (this.sessionId) return this.sessionId;

		// Coalesce concurrent callers
		if (this.sessionIdPromise) return this.sessionIdPromise;

		this.sessionIdPromise = (async () => {
			const sessionId = await createKernelSession();
			this.sessionId = sessionId;
			this.sessionIdPromise = null;
			return sessionId;
		})();

		return this.sessionIdPromise;
	}

	/** Get or create the shared browser instance (CDP connection, used by V1 helpers) */
	async getBrowser(): Promise<Browser> {
		if (this.browser?.connected) return this.browser;

		if (this.initPromise) return this.initPromise;

		const oldSessionId = this.sessionId;
		this.browser = null;
		this.sessionId = null;

		this.initPromise = (async () => {
			if (oldSessionId) {
				await deleteKernelSession({ sessionId: oldSessionId });
			}

			const { browser, sessionId } = await createBrowser();
			this.browser = browser;
			this.sessionId = sessionId;
			this.initPromise = null;
			return browser;
		})();

		return this.initPromise;
	}

	/** Create a new page (tab) in the shared browser */
	async newPage(): Promise<Page> {
		const browser = await this.getBrowser();
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		return page;
	}

	/** Create a dedicated browser instance not shared with other callers */
	async createIsolatedBrowser(): Promise<IsolatedBrowser> {
		const { browser, sessionId } = await createBrowser();
		return {
			browser,
			sessionId,
			cleanup: () => cleanupBrowser({ browser, sessionId }),
		};
	}

	/** Close the shared browser and clean up Kernel session */
	async close(): Promise<void> {
		if (this.browser) {
			await cleanupBrowser({
				browser: this.browser,
				sessionId: this.sessionId,
			});
			this.browser = null;
			this.sessionId = null;
			return;
		}

		// Session-only mode (V2 helpers — no CDP connection was made)
		if (this.sessionId) {
			await deleteKernelSession({ sessionId: this.sessionId });
			this.sessionId = null;
		}
	}
}

export const browserPool = new BrowserPool();

// Auto-cleanup when test file finishes — prevents Kernel browser leaks
afterAll(async () => {
	console.log("[BrowserPool] afterAll: cleaning up...");
	await browserPool.close();
	console.log("[BrowserPool] afterAll: cleanup done");
});

process.on("beforeExit", async () => {
	await browserPool.close();
});

process.on("SIGTERM", async () => {
	await browserPool.close();
	process.exit(0);
});

process.on("SIGINT", async () => {
	await browserPool.close();
	process.exit(0);
});
