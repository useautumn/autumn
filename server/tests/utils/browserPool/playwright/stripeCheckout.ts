import type { Page } from "playwright-core";

/**
 * Billing address override (defaults to US / 10001). Supply when the
 * session uses auto_tax + `customer_update: { address: "auto" }`, which
 * makes Stripe present a full address form. Field names mirror
 * Stripe.AddressParam.
 */
export type StripeCheckoutBillingAddress = {
	country?: string;
	line1?: string;
	city?: string;
	state?: string;
	postal_code?: string;
};

/**
 * Self-contained Playwright function for completing a Stripe Checkout page.
 * NO runtime imports — must be serializable via `fn.toString()` for Kernel
 * Playwright Execution (type imports are fine; Bun strips them).
 *
 * Handles card fields, optional quantity selector, promo code, optional
 * full billing address (when `customer_update.address: "auto"`), and submit.
 */
export const stripeCheckout = async ({
	page,
	url,
	overrideQuantity,
	promoCode,
	billingAddress,
}: {
	page: Page;
	url: string;
	overrideQuantity?: number;
	promoCode?: string;
	billingAddress?: StripeCheckoutBillingAddress;
}) => {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	console.log("[stripeCheckout] Page loaded");

	await page.waitForTimeout(3000);

	// Select Card. The radio is hidden by an AccordionButton overlay; click
	// the data-testid button via JS, fall back to the radio.
	try {
		const cardBtn = page.locator('[data-testid="card-accordion-item-button"]');
		if ((await cardBtn.count()) > 0) {
			await cardBtn.evaluate((el) => (el as HTMLElement).click());
			console.log("[stripeCheckout] Card selected via accordion button");
			await page.waitForTimeout(1000);
		} else {
			await page.evaluate(() => {
				const radio = document.getElementById(
					"payment-method-accordion-item-title-card",
				);
				if (radio) radio.click();
			});
			console.log("[stripeCheckout] Card selected via radio fallback");
			await page.waitForTimeout(500);
		}
	} catch {
		// Card may already be selected or absent.
	}

	// Card fields require real key events — `.fill()` skips keydown/up so
	// Stripe never registers the input. Use `.pressSequentially()`.
	const cardNumber = page.locator("#cardNumber");
	await cardNumber.waitFor({ timeout: 120000 });
	await cardNumber.pressSequentially("4242424242424242");
	console.log("[stripeCheckout] Card number filled");

	const cardExpiry = page.locator("#cardExpiry");
	await cardExpiry.waitFor({ timeout: 60000 });
	await cardExpiry.pressSequentially("1234");
	console.log("[stripeCheckout] Expiry filled");

	const cardCvc = page.locator("#cardCvc");
	await cardCvc.waitFor({ timeout: 60000 });
	await cardCvc.pressSequentially("123");
	console.log("[stripeCheckout] CVC filled");

	const billingName = page.locator("#billingName");
	await billingName.waitFor({ timeout: 60000 });
	await billingName.pressSequentially("Test Customer");
	console.log("[stripeCheckout] Billing name filled");

	try {
		const emailField = page.locator("#email");
		if ((await emailField.count()) > 0) {
			await emailField.pressSequentially("test@example.com");
			console.log("[stripeCheckout] Email filled");
		}
	} catch {
		// Email field absent.
	}

	// Address fields. Defaults: US / 10001.
	const country = billingAddress?.country ?? "US";
	const postalCode = billingAddress?.postal_code ?? "10001";
	const line1 = billingAddress?.line1;
	const city = billingAddress?.city;
	const state = billingAddress?.state;

	try {
		const countrySelect = page.locator("#billingCountry");
		if ((await countrySelect.count()) > 0) {
			await countrySelect.selectOption(country);
			console.log(`[stripeCheckout] Country set to ${country}`);
			await page.waitForTimeout(500);
		}
	} catch {
		// Country selector absent.
	}

	// Full address form (line1/city/state) appears only when the session
	// uses `customer_update: { address: "auto" }`. Feature-detect each.
	if (line1) {
		try {
			const line1Field = page.locator("#billingAddressLine1");
			if ((await line1Field.count()) > 0) {
				await line1Field.pressSequentially(line1);
				console.log(`[stripeCheckout] Address line 1 filled: ${line1}`);
			}
		} catch {}
	}

	if (city) {
		try {
			const cityField = page.locator("#billingLocality");
			if ((await cityField.count()) > 0) {
				await cityField.pressSequentially(city);
				console.log(`[stripeCheckout] City filled: ${city}`);
			}
		} catch {}
	}

	if (state) {
		try {
			const stateField = page.locator("#billingAdministrativeArea");
			if ((await stateField.count()) > 0) {
				// State is a select on US/CA/AU; fall back to typing.
				try {
					await stateField.selectOption(state);
				} catch {
					await stateField.pressSequentially(state);
				}
				console.log(`[stripeCheckout] State filled: ${state}`);
			}
		} catch {}
	}

	try {
		const postalField = page.locator("#billingPostalCode");
		if ((await postalField.count()) > 0) {
			await postalField.pressSequentially(postalCode);
			console.log(`[stripeCheckout] Postal code filled: ${postalCode}`);
		}
	} catch {}

	if (overrideQuantity !== undefined && overrideQuantity !== null) {
		const quantityBtn = page.locator(".AdjustableQuantitySelector").first();
		if ((await quantityBtn.count()) === 0) {
			throw new Error(
				".AdjustableQuantitySelector not found - did you pass adjustable_quantity: true in attach params?",
			);
		}
		await quantityBtn.click();
		console.log("[stripeCheckout] Quantity selector clicked");

		const quantityInput = page.locator("#adjustQuantity");
		await quantityInput.waitFor({ timeout: 60000 });
		await quantityInput.click({ clickCount: 3 });
		await page.keyboard.press("Backspace");
		await quantityInput.pressSequentially(overrideQuantity.toString());

		const updateBtn = page.locator(".AdjustQuantityFooter-btn").first();
		if ((await updateBtn.count()) === 0) {
			throw new Error(".AdjustQuantityFooter-btn not found");
		}
		await updateBtn.click();
		console.log(`[stripeCheckout] Quantity set to ${overrideQuantity}`);
		await page.waitForTimeout(1000);
	}

	if (promoCode) {
		const promoInput = page.locator("#promotionCode");
		await promoInput.waitFor({ timeout: 60000 });
		await promoInput.click();
		await promoInput.pressSequentially(promoCode);
		await page.keyboard.press("Enter");
		console.log(`[stripeCheckout] Promo code "${promoCode}" applied`);
		await page.waitForTimeout(5000);
	}

	// Submit via JS click — Stripe overlays (Link, phone) can obscure the
	// button and break Playwright's actionability check.
	const submitBtn = page.locator(".SubmitButton-TextContainer").first();
	if ((await submitBtn.count()) === 0) {
		throw new Error(".SubmitButton-TextContainer not found");
	}
	await submitBtn.evaluate((el) => (el as HTMLElement).click());
	console.log("[stripeCheckout] Submit clicked");

	// Wait for checkout processing + webhook delivery.
	await page.waitForTimeout(20000);
	console.log("[stripeCheckout] Checkout complete");
};
