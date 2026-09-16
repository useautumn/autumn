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
	const initialState = await Promise.race([
		paid.waitFor().then(() => "paid"),
		readyForm.waitFor().then(() => "form"),
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
	const phone = paymentFrame
		.locator(
			'input[name="phone"], input[name="phoneNumber"], input[autocomplete="tel"]',
		)
		.first();
	if (await phone.isVisible()) await phone.fill("+12025550100");

	await page
		.locator(
			'button[type="submit"], button.SubmitButton, [data-testid="hosted-payment-submit-button"]',
		)
		.first()
		.click();
	const deadline = performance.now() + 30_000;
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
		if (message) throw new Error(`Stripe invoice payment rejected: ${message}`);
		await page.waitForTimeout(250);
	}
	throw new Error(
		"Stripe hosted invoice did not confirm payment within 30000ms",
	);
};
