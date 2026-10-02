import type { Page } from "playwright-core";

// Kept self-contained because the remote browser executor serializes this function.
export const invoiceCheckout = async ({
	page,
	url,
}: {
	page: Page;
	url: string;
}) => {
	page.setDefaultTimeout(15_000);
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
	const paid = page
		.getByText(
			/^(invoice paid|paid|thanks for your payment|payment (successful|received))[.!]?$/i,
		)
		.first();
	const paymentFrame = page
		.frameLocator('iframe[title="Secure payment input frame"]')
		.first();
	const cardInput = paymentFrame
		.locator(
			'input[name="number"], input[data-elements-stable-field-name="cardNumber"]',
		)
		.first();
	const cardAccordion = paymentFrame.locator(
		'[role="button"][data-value="card"]',
	);
	const readyForm = paymentFrame
		.locator(
			'input[name="number"]:visible, input[data-elements-stable-field-name="cardNumber"]:visible, [role="button"][data-value="card"]:visible',
		)
		.first();
	// Under tw the page's own Stripe API calls queue for rate-limit permits (up to 60s each),
	// so the form can take well over the default timeout to render.
	const initialState = await Promise.race([
		paid.waitFor({ timeout: 60_000 }).then(() => "paid"),
		readyForm.waitFor({ timeout: 60_000 }).then(() => "form"),
	]);
	if (initialState === "paid") return;
	if (!(await cardInput.isVisible())) await cardAccordion.click();

	await cardInput.pressSequentially("4242424242424242");
	await paymentFrame
		.locator(
			'input[name="expiry"], input[data-elements-stable-field-name="cardExpiry"]',
		)
		.first()
		.pressSequentially("1228");
	await paymentFrame
		.locator(
			'input[name="cvc"], input[data-elements-stable-field-name="cardCvc"]',
		)
		.first()
		.pressSequentially("123");

	const country = paymentFrame.locator('select[name="country"]');
	if (await country.count()) await country.selectOption("US");
	const postalCode = paymentFrame
		.locator(
			'input[name="postalCode"], input[data-elements-stable-field-name="postalCode"]',
		)
		.first();
	if (await postalCode.count()) await postalCode.fill("10001");
	const saveWithLink = paymentFrame.locator('input[name="linkOptIn"]');
	// Link renders its opt-in (checked) after the card fields; deciding before it exists submits with Link on.
	await saveWithLink
		.waitFor({ state: "attached", timeout: 5_000 })
		.catch(() => {});
	if ((await saveWithLink.isVisible()) && (await saveWithLink.isChecked())) {
		await saveWithLink.press("Space");
		await paymentFrame
			.locator('input[name="linkOptIn"]:checked')
			.waitFor({ state: "hidden" });
	}

	// A click here can land on the payment iframe while the page is still scrolling to Pay;
	// Enter goes to the focused button wherever it is on screen.
	await page
		.locator(
			'button[type="submit"], button.SubmitButton, [data-testid="hosted-payment-submit-button"]',
		)
		.first()
		.press("Enter");
	// Watches for errors and a CAPTCHA; the caller asks Stripe whether the payment went through.
	const deadline = performance.now() + 10_000;
	while (performance.now() < deadline) {
		if (await paid.isVisible()) {
			console.log("[invoiceCheckout] Payment confirmed by hosted page");
			return;
		}
		for (const frame of page.frames()) {
			if (!/^https:\/\/[^/]*hcaptcha\.com\//.test(frame.url())) continue;
			const element = await frame.frameElement();
			try {
				if (!(await element.isVisible())) continue;
				const text = await frame.locator("body").innerText({ timeout: 1000 });
				if (!/\bverify\b|please try again/i.test(text)) continue;
				const error = new Error(
					"Stripe hosted invoice requires a CAPTCHA challenge",
				);
				error.name = "StripeBrowserChallengeError";
				throw error;
			} finally {
				await element.dispose();
			}
		}
		const errors = await paymentFrame
			.locator('[role="alert"]:visible')
			.allTextContents();
		const message = errors
			.map((text) => text.trim())
			.filter(Boolean)
			.join("; ");
		if (message) {
			const fields = await paymentFrame.locator("input").evaluateAll((inputs) =>
				inputs
					.filter(
						(input): input is HTMLInputElement =>
							input instanceof HTMLInputElement,
					)
					.map((input) => ({
						name: input.name,
						stableName: input.getAttribute("data-elements-stable-field-name"),
						type: input.type,
						autocomplete: input.autocomplete,
						visible: input.getClientRects().length > 0,
						checked: input.type === "checkbox" ? input.checked : undefined,
					})),
			);
			throw new Error(
				`Stripe invoice payment rejected: ${message}; fields=${JSON.stringify(fields)}`,
			);
		}
		await page.waitForTimeout(250);
	}
	console.log(
		"[invoiceCheckout] Submitted; hosted page showed no confirmation within 10000ms",
	);
};
