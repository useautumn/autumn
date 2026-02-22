import type { Page } from "playwright-core";

/**
 * Self-contained Playwright function for completing a Stripe 3DS Invoice Confirmation.
 * NO external imports — this function must be serializable via fn.toString()
 * for Kernel Playwright Execution. (type imports are fine — Bun strips them)
 */
export const invoiceConfirmation = async ({
	page,
	url,
}: {
	page: Page;
	url: string;
}) => {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
	console.log("[invoiceConfirmation] Page loaded");

	// Find and click the "Confirm payment" button
	const confirmBtn = page
		.locator("button")
		.filter({ hasText: /confirm payment/i })
		.first();
	await confirmBtn.waitFor({ timeout: 15000 });
	await confirmBtn.click();
	console.log("[invoiceConfirmation] Confirm payment clicked");

	// Wait for the 3DS challenge iframe to appear
	await page.waitForTimeout(3000);

	let authorizeClicked = false;

	// Poll for the 3DS challenge frame
	for (let i = 0; i < 20; i++) {
		await page.waitForTimeout(2000);

		// Try the direct #test-source-authorize-3ds button in any frame
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
			} catch {
				// Frame may not be ready yet
			}
		}
		if (authorizeClicked) break;
	}

	if (!authorizeClicked) {
		throw new Error(
			"Could not find or click #test-source-authorize-3ds in any frame",
		);
	}

	// Wait for 3DS authentication to complete + webhook processing
	await page.waitForTimeout(10000);
	console.log("[invoiceConfirmation] 3DS confirmation complete");
};
