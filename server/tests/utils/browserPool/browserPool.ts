import { afterAll } from "bun:test";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { getChromiumPath, HEADLESS } from "./browserConfig.js";
import {
	createKernelBrowser,
	createKernelSession,
	deleteKernelSession,
	kernel,
} from "./kernelBrowser.js";

export type IsolatedBrowser = {
	browser: Browser;
	sessionId: string | null;
	cleanup: () => Promise<void>;
};

const CDP_CONNECT_MAX_ATTEMPTS = 4;
const CDP_CONNECT_BASE_DELAY_MS = 2000;
const KERNEL_STARTUP_DELAY_MS = 2000;

const createBrowser = async (): Promise<{
	browser: Browser;
	sessionId: string | null;
}> => {
	if (kernel) {
		const { sessionId, cdpWsUrl } = await createKernelBrowser();

		await new Promise((r) => setTimeout(r, KERNEL_STARTUP_DELAY_MS));

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
		executablePath: getChromiumPath(),
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-gpu",
		],
	});
	return { browser, sessionId: null };
};

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

class BrowserPool {
	private browser: Browser | null = null;
	private sessionId: string | null = null;
	private initPromise: Promise<Browser> | null = null;
	private sessionIdPromise: Promise<string> | null = null;

	async getSessionId(): Promise<string> {
		if (this.sessionId) return this.sessionId;

		if (this.sessionIdPromise) return this.sessionIdPromise;

		this.sessionIdPromise = (async () => {
			const sessionId = await createKernelSession();
			this.sessionId = sessionId;
			this.sessionIdPromise = null;
			return sessionId;
		})();

		return this.sessionIdPromise;
	}

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

	async newPage(): Promise<Page> {
		const browser = await this.getBrowser();
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
		return page;
	}

	async createIsolatedBrowser(): Promise<IsolatedBrowser> {
		const { browser, sessionId } = await createBrowser();
		return {
			browser,
			sessionId,
			cleanup: () => cleanupBrowser({ browser, sessionId }),
		};
	}

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

		if (this.sessionId) {
			await deleteKernelSession({ sessionId: this.sessionId });
			this.sessionId = null;
		}
	}
}

export const browserPool = new BrowserPool();

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
