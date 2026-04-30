import type { Page } from "playwright-core";

/**
 * Optional billing address override for the checkout form. When omitted, the
 * helper defaults to a US address with postal code 10001 (the historical
 * behavior). Supply this when the test needs Stripe Checkout to collect a
 * specific country/region — typically required when the merchant has
 * `automatic_tax: { enabled: true }` and `customer_update: { address: "auto" }`,
 * which makes Stripe present a FULL address form (line1, city, state,
 * postal_code, country) rather than just postal code.
 *
 * Field names mirror Stripe.AddressParam.
 */
export type StripeCheckoutBillingAddress = {
	country?: string;
	line1?: string;
	city?: string;
	state?: string;
	postal_code?: string;
};

/**
 * Self-contained Playwright function for completing a Stripe Checkout session page.
 * NO external imports — this function must be serializable via fn.toString()
 * for Kernel Playwright Execution. (type imports are fine — Bun strips them)
 *
 * Handles checkout.stripe.com pages which have:
 * 1. Direct DOM selectors (#cardNumber, #cardExpiry, #cardCvc, #billingName)
 * 2. Optional adjustable quantity (.AdjustableQuantitySelector)
 * 3. Optional promo code (#promotionCode)
 * 4. Optional full billing address form (line1, city, state) when the
 *    session was created with `customer_update: { address: "auto" }`.
 * 5. Submit button (.SubmitButton-TextContainer)
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

	// Wait for the checkout page to render
	await page.waitForTimeout(3000);

	// Select the Card payment method. The radio input is hidden behind an
	// AccordionButton overlay with expandedClickArea. Use JS click on the
	// data-testid button, with a fallback to the radio input directly.
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
		// Card might already be selected or not present
	}

	// Stripe's card inputs are custom components that require individual key events.
	// .fill() sets the value programmatically and skips keydown/keypress/keyup,
	// so Stripe never registers the input. Use .pressSequentially() instead.
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
		// Email field not present
	}

	// Resolve billing address fields. Defaults preserve historical behavior
	// (US / 10001) when no explicit billingAddress is supplied.
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
		// Country selector not present
	}

	// When `customer_update: { address: "auto" }` was set on the session,
	// Stripe Checkout shows a full billing address form (line1, city, state)
	// rather than just postal code. These fields are optional — they only
	// appear when address collection is enabled, so we feature-detect each.
	if (line1) {
		try {
			const line1Field = page.locator("#billingAddressLine1");
			if ((await line1Field.count()) > 0) {
				await line1Field.pressSequentially(line1);
				console.log(`[stripeCheckout] Address line 1 filled: ${line1}`);
			}
		} catch {
			// Line 1 not present
		}
	}

	if (city) {
		try {
			const cityField = page.locator("#billingLocality");
			if ((await cityField.count()) > 0) {
				await cityField.pressSequentially(city);
				console.log(`[stripeCheckout] City filled: ${city}`);
			}
		} catch {
			// City not present
		}
	}

	if (state) {
		try {
			const stateField = page.locator("#billingAdministrativeArea");
			if ((await stateField.count()) > 0) {
				// State is a select on US / CA / AU; try selectOption first,
				// fall back to typing.
				try {
					await stateField.selectOption(state);
				} catch {
					await stateField.pressSequentially(state);
				}
				console.log(`[stripeCheckout] State filled: ${state}`);
			}
		} catch {
			// State not present
		}
	}

	try {
		const postalField = page.locator("#billingPostalCode");
		if ((await postalField.count()) > 0) {
			await postalField.pressSequentially(postalCode);
			console.log(`[stripeCheckout] Postal code filled: ${postalCode}`);
		}
	} catch {
		// Postal code field not present
	}

	// Handle adjustable quantity if requested
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

	// Handle promo code if provided
	if (promoCode) {
		const promoInput = page.locator("#promotionCode");
		await promoInput.waitFor({ timeout: 60000 });
		await promoInput.click();
		await promoInput.pressSequentially(promoCode);
		await page.keyboard.press("Enter");
		console.log(`[stripeCheckout] Promo code "${promoCode}" applied`);
		await page.waitForTimeout(5000);
	}

	// Click submit button — use force:true because Stripe overlays (Link, phone number)
	// can obscure the button and cause Playwright's actionability checks to time out.
	const submitBtn = page.locator(".SubmitButton-TextContainer").first();
	if ((await submitBtn.count()) === 0) {
		throw new Error(".SubmitButton-TextContainer not found");
	}
	await submitBtn.evaluate((el) => (el as HTMLElement).click());
	console.log("[stripeCheckout] Submit clicked");

	// Wait for checkout to process + webhook delivery
	await page.waitForTimeout(20000);
	console.log("[stripeCheckout] Checkout complete");
};
