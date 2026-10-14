import type { Page } from "playwright-core";

export type StripeCheckoutBillingAddress = {
	country?: string;
	line1?: string;
	city?: string;
	state?: string;
	postal_code?: string;
};

export const stripeCheckout = async ({
	page,
	url,
	overrideQuantity,
	promoCode,
	billingAddress,
	addOptionalItem,
}: {
	page: Page;
	url: string;
	overrideQuantity?: number;
	promoCode?: string;
	billingAddress?: StripeCheckoutBillingAddress;
	addOptionalItem?: boolean;
}) => {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	console.log("[stripeCheckout] Page loaded");

	const cardAccordion = page.locator(
		'[data-testid="card-accordion-item-button"]',
	);
	const cardNumber = page.locator("#cardNumber");
	await cardAccordion
		.or(cardNumber)
		.first()
		.waitFor({ state: "attached", timeout: 60_000 });
	console.log("[stripeCheckout] Form rendered");

	if (addOptionalItem) {
		const addBtn = page.getByRole("button", { name: /^add$/i }).first();
		await addBtn.waitFor({ timeout: 15000 });
		await addBtn.evaluate((el) => (el as HTMLElement).click());
		console.log("[stripeCheckout] Optional item added");
		await page.waitForTimeout(1000);
	}

	if (!(await cardNumber.isVisible()) && (await cardAccordion.count()) > 0) {
		await cardAccordion.evaluate((el) => (el as HTMLElement).click());
		console.log("[stripeCheckout] Card selected via accordion button");
	}

	await cardNumber.waitFor({ timeout: 60_000 });
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
	} catch {}

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
	} catch {}

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
		await quantityInput.waitFor({ state: "hidden", timeout: 60_000 });
		console.log(`[stripeCheckout] Quantity set to ${overrideQuantity}`);
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

	const saveWithLink = page.locator("#enableStripePass");
	if (await saveWithLink.isVisible()) {
		await saveWithLink.uncheck();
	}

	const submit = page
		.locator("button.SubmitButton, button[type=submit]")
		.first();
	await (await submit.elementHandle({ timeout: 60_000 }))?.waitForElementState(
		"enabled",
		{ timeout: 60_000 },
	);
	await submit.press("Enter");
	console.log("[stripeCheckout] Submit pressed");

	const leftCheckout = await page
		.waitForURL((url) => !url.host.includes("checkout.stripe.com"), {
			timeout: 60_000,
		})
		.then(() => true)
		.catch(() => false);

	if (leftCheckout) {
		console.log(`[stripeCheckout] Checkout complete — landed on ${page.url()}`);
		return { url: page.url(), text: "" };
	}

	const pageText = await page
		.evaluate(() => document.body.innerText)
		.catch(() => "");

	if (
		/declined|card was not|insufficient funds|try a different card/i.test(
			pageText,
		)
	) {
		throw new Error(
			`Checkout payment failed: ${pageText.replace(/\s+/g, " ").slice(0, 300)}`,
		);
	}

	console.log("[stripeCheckout] No redirect seen; leaving the check to caller");

	return { url: page.url(), text: pageText.replace(/\s+/g, " ").slice(0, 400) };
};
