import type { Page } from "playwright-core";

/**
 * Self-contained Playwright function for completing a Stripe setup payment checkout.
 * NO external imports — this function must be serializable via fn.toString()
 * for Kernel Playwright Execution. (type imports are fine — Bun strips them)
 *
 * Handles setup mode checkout (mode: "setup") for adding payment methods.
 * Uses checkout.stripe.com direct DOM selectors, CVC is "100",
 * and unchecks the Stripe Link "Save my info" checkbox if present.
 */
export const setupPayment = async ({
	page,
	url,
}: {
	page: Page;
	url: string;
}) => {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	console.log("[setupPayment] Page loaded");

	// Wait for the checkout page to render
	await page.waitForTimeout(3000);

	// Select the Card payment method. The hidden radio input is covered by an
	// AccordionButton overlay (expandedClickArea). Target that button via
	// data-testid and use a JS click since it has no visible text content.
	try {
		const cardBtn = page.locator('[data-testid="card-accordion-item-button"]');
		if ((await cardBtn.count()) > 0) {
			await cardBtn.evaluate((el) => (el as HTMLElement).click());
			console.log("[setupPayment] Card selected via accordion button JS click");
			await page.waitForTimeout(1000);
		} else {
			// Fallback: try the accordion ID directly via JS
			await page.evaluate(() => {
				const radio = document.getElementById(
					"payment-method-accordion-item-title-card",
				);
				if (radio) radio.click();
			});
			console.log("[setupPayment] Card selected via radio JS click fallback");
			await page.waitForTimeout(1000);
		}
	} catch {
		// Card might already be selected
	}

	const cardNumber = page.locator("#cardNumber");
	await cardNumber.waitFor({ timeout: 10000 });
	await cardNumber.pressSequentially("4242424242424242");
	console.log("[setupPayment] Card number filled");

	const cardExpiry = page.locator("#cardExpiry");
	await cardExpiry.waitFor({ timeout: 5000 });
	await cardExpiry.pressSequentially("1228");
	console.log("[setupPayment] Expiry filled");

	const cardCvc = page.locator("#cardCvc");
	await cardCvc.waitFor({ timeout: 5000 });
	await cardCvc.pressSequentially("100");
	console.log("[setupPayment] CVC filled");

	const billingName = page.locator("#billingName");
	await billingName.waitFor({ timeout: 5000 });
	await billingName.pressSequentially("Test Customer");
	console.log("[setupPayment] Billing name filled");

	// Uncheck "Save my information for faster checkout" (Stripe Link) if checked.
	// This must be unchecked or the submit button stays greyed out.
	// The checkbox input is hidden behind custom styling, so use JS click directly.
	try {
		const wasChecked = await page.evaluate(() => {
			const cb = document.getElementById("enableStripePass") as HTMLInputElement | null;
			if (cb && cb.checked) {
				cb.click();
				return true;
			}
			return false;
		});
		if (wasChecked) {
			console.log("[setupPayment] Stripe Link checkbox unchecked");
			await page.waitForTimeout(500);
		}
	} catch {
		// Stripe Link checkbox not present
	}

	// Force country to US so a postal code input is always shown
	try {
		const countrySelect = page.locator("#billingCountry");
		if ((await countrySelect.count()) > 0) {
			await countrySelect.selectOption("US");
			console.log("[setupPayment] Country set to US");
			await page.waitForTimeout(500);
		}
	} catch {
		// Country selector not present
	}

	try {
		const postalCode = page.locator("#billingPostalCode");
		if ((await postalCode.count()) > 0) {
			await postalCode.pressSequentially("10001");
			console.log("[setupPayment] Postal code filled");
		}
	} catch {
		// Postal code field not present
	}

	const submitBtn = page.locator(".SubmitButton-TextContainer").first();
	if ((await submitBtn.count()) > 0) {
		await submitBtn.evaluate((el) => (el as HTMLElement).click());
		console.log("[setupPayment] Submit clicked");
	}

	// Wait for form submission to complete
	await page.waitForTimeout(7000);
	console.log("[setupPayment] Setup payment complete");
};
