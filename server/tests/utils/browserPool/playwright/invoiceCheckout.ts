import type { Page } from "playwright-core";

/**
 * Self-contained Playwright function for completing a Stripe Invoice Checkout.
 * NO external imports — this function must be serializable via fn.toString()
 * for Kernel Playwright Execution. (type imports are fine — Bun strips them)
 *
 * Handles the Stripe hosted invoice page which has:
 * 1. A payment method accordion (Card / Cash App Pay / Klarna) on the main page
 * 2. Card form inputs inside a nested Stripe iframe (Payment Element)
 * 3. A submit/pay button on the main page
 */
export const invoiceCheckout = async ({
	page,
	url,
}: {
	page: Page;
	url: string;
}) => {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
	console.log("[invoiceCheckout] Page loaded");

	// Wait for the page to fully render — Stripe hosted invoice pages load JS dynamically
	await page.waitForTimeout(5000);

	// Step 1: Find the Payment Element iframe.
	// On the hosted invoice page, the payment element is rendered inside an iframe.
	// We need to wait for it to appear — it may take a few seconds after page load.
	let paymentFrame = null;

	// Try to find the iframe via #payment-element first (embedded Payment Element)
	try {
		await page.waitForSelector("#payment-element iframe", { timeout: 10000 });
		paymentFrame = page.frameLocator("#payment-element iframe");
		console.log("[invoiceCheckout] Found #payment-element iframe");
	} catch {
		console.log(
			"[invoiceCheckout] No #payment-element iframe, searching all frames...",
		);
	}

	// Fallback: search all frames for one containing Stripe payment fields
	if (!paymentFrame) {
		// On hosted invoice pages, Stripe renders the payment form in iframes
		// Look for any iframe that contains card input fields
		const frames = page.frames();
		for (const frame of frames) {
			try {
				const cardInput = frame.locator(
					'input[name="number"], input[data-elements-stable-field-name="cardNumber"]',
				);
				if ((await cardInput.count()) > 0) {
					paymentFrame = frame;
					console.log(
						`[invoiceCheckout] Found payment frame: ${frame.url().substring(0, 80)}`,
					);
					break;
				}
			} catch {
				// Frame not ready
			}
		}
	}

	// If still no payment frame, the card accordion might need clicking first.
	// On hosted invoice pages, the "Card" option is an accordion on the main page.
	if (!paymentFrame) {
		console.log(
			"[invoiceCheckout] No payment frame found yet, trying to click Card accordion...",
		);

		// Try clicking the Card payment method option
		const cardOptionSelectors = [
			'[data-testid="CARD-tab"]',
			"text=Card",
			'button:has-text("Card")',
			'[role="tab"]:has-text("Card")',
			'[role="button"]:has-text("Card")',
			'.TabLabel:has-text("Card")',
		];

		for (const sel of cardOptionSelectors) {
			try {
				const el = page.locator(sel).first();
				if ((await el.count()) > 0) {
					await el.click();
					console.log(
						`[invoiceCheckout] Clicked card option with selector: ${sel}`,
					);
					await page.waitForTimeout(3000);
					break;
				}
			} catch {
				// Try next selector
			}
		}

		// Now try to find the payment frame again
		try {
			await page.waitForSelector("#payment-element iframe", { timeout: 10000 });
			paymentFrame = page.frameLocator("#payment-element iframe");
			console.log(
				"[invoiceCheckout] Found #payment-element iframe after card click",
			);
		} catch {
			// Still try frame search
		}

		if (!paymentFrame) {
			const frames = page.frames();
			for (const frame of frames) {
				try {
					const cardInput = frame.locator(
						'input[name="number"], input[data-elements-stable-field-name="cardNumber"]',
					);
					if ((await cardInput.count()) > 0) {
						paymentFrame = frame;
						console.log(
							`[invoiceCheckout] Found payment frame after click: ${frame.url().substring(0, 80)}`,
						);
						break;
					}
				} catch {
					// Frame not ready
				}
			}
		}
	}

	if (!paymentFrame) {
		// Last resort: dump page info for debugging
		const frameUrls = page
			.frames()
			.map((f: { url: () => string }) => f.url())
			.join("\n");
		throw new Error(
			`Could not find Stripe payment frame. Page frames:\n${frameUrls}`,
		);
	}

	// Step 2: Expand the Card accordion inside the payment frame if collapsed
	try {
		const cardAccordion = paymentFrame.locator(
			'[role="button"][data-value="card"]',
		);
		if ((await cardAccordion.count()) > 0) {
			const isExpanded = await cardAccordion.getAttribute("aria-expanded");
			if (isExpanded === "false") {
				await cardAccordion.click();
				console.log("[invoiceCheckout] Expanded card accordion");
				await page.waitForTimeout(1000);
			}
		}
	} catch {
		// Accordion may not exist — card might be the only option or already expanded
	}

	// Step 3: Fill card details
	const cardInput = paymentFrame
		.locator(
			'input[name="number"], input[data-elements-stable-field-name="cardNumber"], input[placeholder*="1234"], input[aria-label*="Card number"]',
		)
		.first();
	await cardInput.waitFor({ timeout: 15000 });
	await cardInput.click();
	await cardInput.fill("4242424242424242");
	console.log("[invoiceCheckout] Card number filled");

	const expiryInput = paymentFrame
		.locator(
			'input[name="expiry"], input[data-elements-stable-field-name="cardExpiry"], input[placeholder*="MM"], input[aria-label*="expir"]',
		)
		.first();
	await expiryInput.waitFor({ timeout: 10000 });
	await expiryInput.click();
	await expiryInput.fill("1228");
	console.log("[invoiceCheckout] Expiry filled");

	const cvcInput = paymentFrame
		.locator(
			'input[name="cvc"], input[data-elements-stable-field-name="cardCvc"], input[placeholder*="CVC"], input[aria-label*="CVC"]',
		)
		.first();
	await cvcInput.waitFor({ timeout: 10000 });
	await cvcInput.click();
	await cvcInput.fill("123");
	console.log("[invoiceCheckout] CVC filled");

	// Select "United States" as country so we can use a known US zip code.
	// This avoids flaky postal code detection across different locales.
	try {
		const countrySelect = paymentFrame
			.locator('select[name="country"]')
			.first();
		if ((await countrySelect.count()) > 0) {
			await countrySelect.selectOption("US");
			console.log("[invoiceCheckout] Country set to US");
			await page.waitForTimeout(500);
		}
	} catch {
		// Country selector may not exist
	}

	// Fill ZIP code (best-effort — not all locales require it)
	try {
		const postalInput = paymentFrame
			.locator(
				'input[name="postalCode"], input[data-elements-stable-field-name="postalCode"], input[placeholder*="12345"], input[aria-label*="ZIP"], input[aria-label*="Postal"]',
			)
			.first();
		await postalInput.waitFor({ timeout: 5000 });
		await postalInput.click();
		await postalInput.fill("10001");
		console.log("[invoiceCheckout] ZIP code filled: 10001");
	} catch {
		console.log("[invoiceCheckout] No postal code field, skipping");
	}

	// Step 4: Wait for Stripe to process inputs, then click submit
	await page.waitForTimeout(2000);

	// The Pay button is on the main page (not in the iframe).
	// On hosted invoice pages it's a simple <button> with text "Pay".
	// Try multiple strategies, scrolling into view before clicking.
	let clicked = false;

	// Strategy 1: Known Stripe hosted invoice selectors
	const submitSelectors = [
		".SubmitButton-IconContainer",
		".SubmitButton",
		"button[type=submit]",
		"[data-testid=hosted-payment-submit-button]",
	];
	for (const sel of submitSelectors) {
		const btn = page.locator(sel).first();
		if ((await btn.count()) > 0) {
			await btn.scrollIntoViewIfNeeded();
			await btn.click();
			clicked = true;
			console.log(`[invoiceCheckout] Clicked submit via: ${sel}`);
			break;
		}
	}

	// Strategy 2: Find button by text "Pay" on the main page
	if (!clicked) {
		const payBtn = page.locator("button").filter({ hasText: /^Pay$/i }).first();
		if ((await payBtn.count()) > 0) {
			await payBtn.scrollIntoViewIfNeeded();
			await payBtn.click();
			clicked = true;
			console.log("[invoiceCheckout] Clicked submit via exact 'Pay' text");
		}
	}

	// Strategy 3: Broader text match
	if (!clicked) {
		const fallbackBtn = page
			.locator("button")
			.filter({ hasText: /pay|pay now|submit|complete/i })
			.first();
		if ((await fallbackBtn.count()) > 0) {
			await fallbackBtn.scrollIntoViewIfNeeded();
			await fallbackBtn.click();
			clicked = true;
			console.log("[invoiceCheckout] Clicked submit via broad text match");
		}
	}

	if (!clicked) {
		throw new Error("Could not find or click any submit/pay button");
	}

	// Step 5: Wait for payment processing + webhook delivery
	await page.waitForTimeout(20000);
	console.log("[invoiceCheckout] Checkout complete");
};
