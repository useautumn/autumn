import { expect, test } from "bun:test";
import type { Page } from "playwright-core";
import { playwrightPool } from "../../utils/browserPool/playwrightPool";

test("a checkout deadline closes its context and stops pending browser actions", async () => {
	let page: Page | undefined;
	let completed = false;
	await expect(
		playwrightPool.runInPage({
			args: {},
			timeoutMs: 5000,
			fn: async ({ page: activePage }: { page: Page }) => {
				page = activePage;
				await activePage.waitForTimeout(10_000);
				completed = true;
			},
		}),
	).rejects.toThrow("Browser checkout exceeded 5000ms");
	expect(page?.isClosed()).toBe(true);
	expect(completed).toBe(false);
}, 15_000);

test("cancelling one checkout closes only its own context", async () => {
	const controller = new AbortController();
	const ready = Promise.withResolvers<void>();
	const first = playwrightPool.runInPage({
		args: {},
		signal: controller.signal,
		fn: async ({ page }: { page: Page }) => {
			ready.resolve();
			await page.waitForTimeout(10_000);
		},
	});
	await ready.promise;
	const rejection = first.catch((error) => error);
	const second = playwrightPool.runInPage({
		args: {},
		fn: async ({ page }: { page: Page }) => {
			controller.abort(new Error("cancelled checkout"));
			await page.setContent("<h1>Independent checkout</h1>");
			return page.locator("h1").innerText();
		},
	});
	expect(await rejection).toMatchObject({ message: "cancelled checkout" });
	expect(await second).toBe("Independent checkout");
}, 15_000);
