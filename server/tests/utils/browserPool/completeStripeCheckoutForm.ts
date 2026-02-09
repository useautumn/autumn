import { notNullish } from "@autumn/shared";
import { timeout } from "../genUtils.js";
import { browserPool } from "./browserPool.js";

/**
 * Complete a Stripe Checkout form using the shared browser pool.
 * Opens a new tab, fills the form, and closes the tab (browser stays open).
 */
export const completeStripeCheckoutForm = async ({
	url,
	overrideQuantity,
	promoCode,
}: {
	url: string;
	overrideQuantity?: number;
	promoCode?: string;
}): Promise<void> => {
	let step = "creating new page";
	const page = await browserPool.newPage();

	try {
		step = "navigating to checkout URL";
		await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

		// Try to click accordion if it exists (wait up to 2 seconds)
		try {
			await page.waitForSelector("#payment-method-accordion-item-title-card", {
				timeout: 2000,
			});
			await page.click("#payment-method-accordion-item-title-card");
			await timeout(500);
		} catch (_e) {
			// Accordion doesn't exist or didn't appear, continue without clicking
		}

		step = "waiting for #cardNumber";
		await page.waitForSelector("#cardNumber", { timeout: 120000 });
		await page.type("#cardNumber", "4242424242424242");

		step = "filling card expiry";
		await page.waitForSelector("#cardExpiry", { timeout: 60000 });
		await page.type("#cardExpiry", "1234");

		step = "filling card CVC";
		await page.waitForSelector("#cardCvc", { timeout: 60000 });
		await page.type("#cardCvc", "123");

		step = "filling billing name";
		await page.waitForSelector("#billingName", { timeout: 60000 });
		await page.type("#billingName", "Test Customer");

		// Email field may be present if customer has no email set
		try {
			await page.waitForSelector("#email", { timeout: 2000 });
			await page.type("#email", "test@example.com");
		} catch (_e) {
			// Email field doesn't exist (customer already has email), continue without it
		}

		// Postal code may not be present for all countries (e.g., UK)
		try {
			await page.waitForSelector("#billingPostalCode", { timeout: 2000 });
			await page.type("#billingPostalCode", "123456");
		} catch (_e) {
			// Postal code field doesn't exist, continue without it
		}

		if (notNullish(overrideQuantity)) {
			step = `finding .AdjustableQuantitySelector for quantity=${overrideQuantity}`;
			const quantityBtn = await page.$(".AdjustableQuantitySelector");
			if (!quantityBtn) {
				throw new Error(
					`.AdjustableQuantitySelector not found - did you pass adjustable_quantity: true in attach params?`,
				);
			}
			await quantityBtn.evaluate((b: any) => (b as HTMLElement).click());

			step = "waiting for #adjustQuantity input";
			await page.waitForSelector("#adjustQuantity", { timeout: 60000 });
			await page.click("#adjustQuantity", { clickCount: 3 }); // Select all text
			await page.keyboard.press("Backspace"); // Delete selected text
			await page.type("#adjustQuantity", overrideQuantity.toString());

			step = "clicking quantity update button";
			const updateBtn = await page.$(".AdjustQuantityFooter-btn");
			if (!updateBtn) {
				throw new Error(`.AdjustQuantityFooter-btn not found`);
			}
			await updateBtn.evaluate((b: any) => (b as HTMLElement).click());

			await timeout(1000);
		}

		if (promoCode) {
			step = "applying promo code";
			await page.waitForSelector("#promotionCode", { timeout: 60000 });
			await page.click("#promotionCode");
			await page.type("#promotionCode", promoCode);
			await page.keyboard.press("Enter");
			await timeout(5000);
		}

		step = "clicking submit button";
		const submitButton = await page.$(".SubmitButton-TextContainer");
		if (!submitButton) {
			throw new Error(`.SubmitButton-TextContainer not found`);
		}
		await submitButton.evaluate((b: any) => (b as HTMLElement).click());

		step = "waiting for checkout to process";

		const testConcurrency = Number(process.env.TEST_FILE_CONCURRENCY || "0");
		const timeoutMs = testConcurrency > 1 ? 30000 : 10000;
		await timeout(timeoutMs);
	} catch (error: any) {
		const msg = error?.message || String(error);
		throw new Error(`[completeStripeCheckoutForm] Failed at "${step}": ${msg}`);
	} finally {
		// Close the page (tab), but keep browser open for reuse
		await page.close();
	}
};
