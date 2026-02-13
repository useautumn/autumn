import { timeout } from "../genUtils.js";
import { browserPool } from "./browserPool.js";

/**
 * Complete a Stripe setup payment checkout form using the shared browser pool.
 * This handles the setup mode checkout flow (mode: "setup") for adding payment methods.
 * Opens a new tab, fills the form, and closes the tab (browser stays open).
 */
export const completeSetupPaymentForm = async ({
	url,
}: {
	url: string;
}): Promise<void> => {
	console.log("[completeSetupPaymentForm] Starting setup payment...");

	const page = await browserPool.newPage();

	try {
		await page.goto(url, { waitUntil: "networkidle2" });

		// Click on Card radio button to expand the card form
		try {
			await page.waitForSelector("#payment-method-accordion-item-title-card", {
				timeout: 3000,
			});
			await page.click("#payment-method-accordion-item-title-card");
			await timeout(500);
		} catch (_e) {
			// Card section might already be expanded or have different structure
		}

		// Fill card number
		await page.waitForSelector("#cardNumber", { timeout: 5000 });
		await page.type("#cardNumber", "4242424242424242");

		// Fill expiry (MM/YY format)
		await page.waitForSelector("#cardExpiry");
		await page.type("#cardExpiry", "1228");

		// Fill CVC
		await page.waitForSelector("#cardCvc");
		await page.type("#cardCvc", "100");

		// Fill cardholder name
		await page.waitForSelector("#billingName");
		await page.type("#billingName", "Test Customer");

		// Uncheck "Save my information for faster checkout" (Stripe Link) if present and checked
		try {
			const enableStripePass = await page.waitForSelector("#enableStripePass", {
				timeout: 3000,
			});
			if (enableStripePass) {
				// Check if the checkbox is currently checked before clicking
				const isChecked = await page.evaluate(
					(el) => (el as HTMLInputElement).checked,
					enableStripePass,
				);
				if (isChecked) {
					// Try multiple click targets - Stripe uses custom styled checkboxes
					// Priority: 1) The styled checkbox span, 2) The checkbox container, 3) The label, 4) The input
					const styledCheckbox = await page.$(".Checkbox-StyledInput");
					const checkboxContainer = await page.$(".Checkbox-InputContainer");
					const label = await page.$('label[for="enableStripePass"]');

					if (styledCheckbox) {
						await styledCheckbox.click();
					} else if (checkboxContainer) {
						await checkboxContainer.click();
					} else if (label) {
						await label.click();
					} else {
						// Fallback: try clicking the input directly
						await enableStripePass.click();
					}
					await timeout(500);

					// Verify it was unchecked
					const stillChecked = await page.evaluate(
						(el) => (el as HTMLInputElement).checked,
						enableStripePass,
					);
					if (stillChecked) {
						console.log(
							"[completeSetupPaymentForm] Warning: Stripe Pass checkbox still checked after click attempt",
						);
					}
				}
			}
		} catch (_e) {
			// Stripe Link checkbox not present
		}

		// Some setup forms have country dropdown, some have postal code
		// Try postal code first, then skip if not present
		try {
			const postalCode = await page.$("#billingPostalCode");
			if (postalCode) {
				await page.type("#billingPostalCode", "12345");
			}
		} catch (_e) {
			// Postal code field not present
		}

		// Click the Save button
		const submitButton = await page.$(".SubmitButton-TextContainer");
		await submitButton?.evaluate((b: any) => (b as HTMLElement).click());

		// Wait for form submission to complete
		await timeout(7000);

		console.log("[completeSetupPaymentForm] Setup payment completed");
	} finally {
		// Close the page (tab), but keep browser open for reuse
		await page.close();
	}
};
