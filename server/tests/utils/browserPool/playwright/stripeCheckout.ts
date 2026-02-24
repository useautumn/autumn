import type { Page } from "playwright-core";

/**
 * Self-contained Playwright function for completing a Stripe Checkout session page.
 * NO external imports — this function must be serializable via fn.toString()
 * for Kernel Playwright Execution. (type imports are fine — Bun strips them)
 *
 * Handles checkout.stripe.com pages which have:
 * 1. Direct DOM selectors (#cardNumber, #cardExpiry, #cardCvc, #billingName)
 * 2. Optional adjustable quantity (.AdjustableQuantitySelector)
 * 3. Optional promo code (#promotionCode)
 * 4. Submit button (.SubmitButton-TextContainer)
 */
export const stripeCheckout = async ({
	page,
	url,
	overrideQuantity,
	promoCode,
}: {
	page: Page;
	url: string;
	overrideQuantity?: number;
	promoCode?: string;
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

	// Force country to US so a postal code input is always shown
	try {
		const countrySelect = page.locator("#billingCountry");
		if ((await countrySelect.count()) > 0) {
			await countrySelect.selectOption("US");
			console.log("[stripeCheckout] Country set to US");
			await page.waitForTimeout(500);
		}
	} catch {
		// Country selector not present
	}

	try {
		const postalCode = page.locator("#billingPostalCode");
		if ((await postalCode.count()) > 0) {
			await postalCode.pressSequentially("10001");
			console.log("[stripeCheckout] Postal code filled");
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
	await page.waitForTimeout(15000);
	console.log("[stripeCheckout] Checkout complete");
};
