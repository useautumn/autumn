import { afterAll } from "bun:test";
import { type Browser, chromium } from "playwright-core";
import { createTestWait } from "../testWait/createTestWait";
import { getChromiumPath, HEADLESS } from "./browserConfig.js";
import { limitStripeBrowserRequests } from "./limitStripeBrowserRequests.js";

class PlaywrightPool {
	private browser: Browser | null = null;
	private initPromise: Promise<Browser> | null = null;

	private async getBrowser(): Promise<Browser> {
		if (this.browser?.isConnected()) return this.browser;

		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			console.log("[PlaywrightPool] Launching local Chromium...");
			const browser = await chromium.launch({
				headless: HEADLESS,
				executablePath: getChromiumPath(),
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
					"--disable-gpu",
				],
			});
			this.browser = browser;
			console.log("[PlaywrightPool] Chromium launched");
			return browser;
		})();

		try {
			return await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	async runInPage({
		fn,
		args,
		timeoutMs = 120_000,
		signal,
	}: {
		// biome-ignore lint/suspicious/noExplicitAny: must accept any self-contained playwright function
		fn: (params: any) => Promise<any>;
		args: Record<string, unknown>;
		timeoutMs?: number;
		signal?: AbortSignal;
	}): Promise<unknown> {
		const browser = await this.getBrowser();
		const context = await browser.newContext({
			viewport: { width: 1280, height: 800 },
		});
		const wait = createTestWait({
			timeoutMs,
			signal,
			description: "Browser checkout",
		});
		let admission: Awaited<ReturnType<typeof limitStripeBrowserRequests>>;
		try {
			return await wait.run(async () => {
				admission = await limitStripeBrowserRequests({ context });
				wait.remainingMs();
				const page = await context.newPage();
				wait.remainingMs();
				return fn({ ...args, page });
			});
		} finally {
			wait.close();
			try {
				await context.close();
			} finally {
				await admission?.close();
			}
		}
	}

	async close(): Promise<void> {
		await this.initPromise?.catch(() => undefined);
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}
}

export const playwrightPool = new PlaywrightPool();

afterAll(async () => {
	await playwrightPool.close();
});
