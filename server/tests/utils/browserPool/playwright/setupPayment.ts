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

	// The form renders only after the page's own Stripe API calls clear tw's rate-limit
	// permits (up to 60s each), so a fixed sleep can run ahead of it.
	const cardAccordion = page.locator(
		'[data-testid="card-accordion-item-button"]',
	);
	const cardNumber = page.locator("#cardNumber");
	await cardAccordion
		.or(cardNumber)
		.first()
		.waitFor({ state: "attached", timeout: 60_000 });

	// The card radio is hidden behind the accordion button, so click that via JS.
	if (!(await cardNumber.isVisible())) {
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

	// Uncheck "Save my information for faster checkout" (Stripe Link) if checked.
	// This must be unchecked or the submit button stays greyed out.
	// The checkbox input is hidden behind custom styling, so use JS click directly.
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

	// Stripe can confirm setup while an unreachable success URL leaves the page processing.
	const confirmationResponse = page.waitForResponse(
		(response) =>
			response.request().method() === "POST" &&
			response.url().startsWith("https://api.stripe.com/v1/payment_pages/") &&
			new URL(response.url()).pathname.endsWith("/confirm"),
		{ timeout: 30_000 },
	);
	// A click can land in a Stripe iframe while the page scrolls to Submit; Enter goes
	// to the focused button wherever it is on screen.
	const submit = page.locator("button[type=submit]");
	await (await submit.elementHandle({ timeout: 30_000 }))?.waitForElementState(
		"enabled",
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
