import type { Page } from "playwright-core";

export const setupPayment = async ({
	page,
	url,
}: {
	page: Page;
	url: string;
}) => {
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	console.log("[setupPayment] Page loaded");

	const cardAccordion = page.locator(
		'[data-testid="card-accordion-item-button"]',
	);
	const cardNumber = page.locator("#cardNumber");
	await cardAccordion
		.or(cardNumber)
		.first()
		.waitFor({ state: "attached", timeout: 60_000 });

	if (!(await cardNumber.isVisible()) && (await cardAccordion.count()) > 0) {
		await cardAccordion.evaluate((el) => (el as HTMLElement).click());
		console.log("[setupPayment] Card selected via accordion button");
	}

	await cardNumber.waitFor({ timeout: 60_000 });
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

	try {
		const wasChecked = await page.evaluate(() => {
			const cb = document.getElementById(
				"enableStripePass",
			) as HTMLInputElement | null;
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
	} catch {}

	try {
		const countrySelect = page.locator("#billingCountry");
		if ((await countrySelect.count()) > 0) {
			await countrySelect.selectOption("US");
			console.log("[setupPayment] Country set to US");
			await page.waitForTimeout(500);
		}
	} catch {}

	try {
		const postalCode = page.locator("#billingPostalCode");
		if ((await postalCode.count()) > 0) {
			await postalCode.pressSequentially("10001");
			console.log("[setupPayment] Postal code filled");
		}
	} catch {}

	const submit = page.locator("button[type=submit]");
	await (await submit.elementHandle({ timeout: 30_000 }))?.waitForElementState(
		"enabled",
		{ timeout: 30_000 },
	);
	const confirmationResponse = page.waitForResponse(
		(response) =>
			response.request().method() === "POST" &&
			response.url().startsWith("https://api.stripe.com/v1/payment_pages/") &&
			new URL(response.url()).pathname.endsWith("/confirm"),
		{ timeout: 30_000 },
	);
	const [response] = await Promise.all([
		confirmationResponse,
		submit.press("Enter"),
	]);
	const confirmation: {
		status?: string;
		setup_intent?: { status?: string };
		error?: { code?: string };
	} = await response.json();
	if (
		!response.ok() ||
		confirmation.status !== "complete" ||
		confirmation.setup_intent?.status !== "succeeded"
	) {
		throw new Error(
			`Stripe setup not confirmed: HTTP ${response.status()}, session=${confirmation.status}, setup=${confirmation.setup_intent?.status}, error=${confirmation.error?.code}`,
		);
	}
	console.log("[setupPayment] Setup payment complete");
};
