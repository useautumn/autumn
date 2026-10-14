import type { Page } from "playwright-core";

export const invoiceConfirmation = async ({
	page,
	url,
}: {
	page: Page;
	url: string;
}) => {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
	console.log("[invoiceConfirmation] Page loaded");

	const confirmBtn = page
		.locator("button")
		.filter({ hasText: /confirm payment/i })
		.first();
	await confirmBtn.waitFor({ timeout: 15000 });
	await confirmBtn.click();
	console.log("[invoiceConfirmation] Confirm payment clicked");

	await page.waitForTimeout(3000);

	let authorizeClicked = false;

	for (let i = 0; i < 20; i++) {
		await page.waitForTimeout(2000);

		for (const frame of page.frames()) {
			try {
				const btn = frame.locator("#test-source-authorize-3ds");
				if ((await btn.count()) > 0) {
					await btn.click({ timeout: 3000 });
					console.log(
						`[invoiceConfirmation] 3DS authorize clicked in frame: ${frame.url().substring(0, 60)}`,
					);
					authorizeClicked = true;
					break;
				}
			} catch {}
		}
		if (authorizeClicked) break;
	}

	if (!authorizeClicked) {
		throw new Error(
			"Could not find or click #test-source-authorize-3ds in any frame",
		);
	}

	await page.waitForTimeout(10000);
	console.log("[invoiceConfirmation] 3DS confirmation complete");
};
