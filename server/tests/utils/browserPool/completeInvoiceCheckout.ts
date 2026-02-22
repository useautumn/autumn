import type { Page } from "puppeteer-core";
import { timeout } from "../genUtils.js";
import { browserPool, type IsolatedBrowser } from "./browserPool.js";

const INPUT_TIMEOUT = 10000;

const CARD_NUMBER_SELECTOR =
	'input[name="number"], input[data-elements-stable-field-name="cardNumber"], input[placeholder*="1234"], input[aria-label*="Card number"]';
const EXPIRY_SELECTOR =
	'input[name="expiry"], input[data-elements-stable-field-name="cardExpiry"], input[placeholder*="MM"], input[aria-label*="expir"]';
const CVC_SELECTOR =
	'input[name="cvc"], input[data-elements-stable-field-name="cardCvc"], input[placeholder*="CVC"], input[aria-label*="CVC"]';
const POSTAL_SELECTOR =
	'input[name="postalCode"], input[data-elements-stable-field-name="postalCode"], input[placeholder*="12345"], input[aria-label*="ZIP"], input[aria-label*="Postal"]';

/**
 * Complete a Stripe Invoice Checkout form.
 * Handles the Payment Element (iframe-based) checkout flow.
 * Throws on any critical failure (missing inputs, submit button not found, etc).
 */
export const completeInvoiceCheckout = async ({
	url,
	isolatedBrowser = false,
}: {
	url: string;
	isolatedBrowser?: boolean;
}): Promise<void> => {
	console.log("[completeInvoiceCheckout] Starting invoice checkout...");

	let isolated: IsolatedBrowser | undefined;
	let page: Page;
	if (isolatedBrowser) {
		isolated = await browserPool.createIsolatedBrowser();
		page = await isolated.browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });
	} else {
		page = await browserPool.newPage();
	}

	try {
		await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

		// Wait for the payment element to load
		await page.waitForSelector("#payment-element", { timeout: 15000 });

		// Wait for the iframe to fully render inside the payment element
		await page.waitForSelector("#payment-element iframe", {
			timeout: 10000,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const stripeFrame = await page.$("#payment-element iframe");
		if (!stripeFrame) {
			throw new Error("Stripe iframe not found after waiting");
		}

		const frame = await stripeFrame.contentFrame();
		if (!frame) {
			throw new Error("Could not access Stripe iframe content");
		}

		// Expand the Card accordion if collapsed (best-effort, may already be expanded)
		try {
			await frame.waitForSelector('[role="button"][data-value="card"]', {
				timeout: 5000,
			});
			const cardAccordionButton = await frame.$(
				'[role="button"][data-value="card"]',
			);
			if (cardAccordionButton) {
				const isExpanded = await frame.evaluate(
					(el) => el.getAttribute("aria-expanded"),
					cardAccordionButton,
				);
				if (isExpanded === "false") {
					await cardAccordionButton.click();
					await frame.waitForSelector(CARD_NUMBER_SELECTOR, {
						timeout: 5000,
					});
				}
			}
		} catch {
			// Accordion may not exist if card is the only payment method — proceed
			console.log(
				"[completeInvoiceCheckout] Card accordion not found or already expanded, proceeding",
			);
		}

		// --- Fill card number (CRITICAL) ---
		await frame.waitForSelector(CARD_NUMBER_SELECTOR, {
			timeout: INPUT_TIMEOUT,
		});
		const cardNumberInput = await frame.$(CARD_NUMBER_SELECTOR);
		if (!cardNumberInput) {
			throw new Error("Card number input not found");
		}
		await cardNumberInput.click();
		await cardNumberInput.type("4242424242424242");
		console.log("[completeInvoiceCheckout] Card number entered");

		// --- Fill expiry (CRITICAL) ---
		await frame.waitForSelector(EXPIRY_SELECTOR, {
			timeout: INPUT_TIMEOUT,
		});
		const expiryInput = await frame.$(EXPIRY_SELECTOR);
		if (!expiryInput) {
			throw new Error("Expiry input not found");
		}
		await expiryInput.click();
		await expiryInput.type("1228");
		console.log("[completeInvoiceCheckout] Expiry entered");

		// --- Fill CVC (CRITICAL) ---
		await frame.waitForSelector(CVC_SELECTOR, { timeout: INPUT_TIMEOUT });
		const cvcInput = await frame.$(CVC_SELECTOR);
		if (!cvcInput) {
			throw new Error("CVC input not found");
		}
		await cvcInput.click();
		await cvcInput.type("123");
		console.log("[completeInvoiceCheckout] CVC entered");

		// --- Fill postal code (best-effort — not all locales require it) ---
		try {
			await frame.waitForSelector(POSTAL_SELECTOR, { timeout: 5000 });
			const postalInput = await frame.$(POSTAL_SELECTOR);
			if (postalInput) {
				const frameText = await frame.evaluate(() => document.body.innerText);
				const isUS = /zip/i.test(frameText);
				const postalCode = isUS ? "10001" : "SW59SX";
				console.log(
					`[completeInvoiceCheckout] Entering ${isUS ? "ZIP" : "Postal"}: ${postalCode}`,
				);
				await postalInput.click();
				await postalInput.type(postalCode);
			}
		} catch {
			console.log(
				"[completeInvoiceCheckout] No postal code field found, skipping",
			);
		}

		// Wait for Stripe to process all inputs before submitting
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// --- Click submit button (CRITICAL) ---
		const clicked = await clickSubmitButton({ page });
		if (!clicked) {
			throw new Error(
				"Could not find or click any submit/pay button on the checkout page",
			);
		}
		console.log("[completeInvoiceCheckout] Submit button clicked");

		// Wait for payment processing + webhook delivery
		await timeout(20000);
		console.log("[completeInvoiceCheckout] Invoice checkout completed");
	} finally {
		await page.close();
		if (isolated) {
			await isolated.cleanup();
		}
	}
};

/** Try multiple selector strategies to find and click the submit/pay button */
const clickSubmitButton = async ({
	page,
}: {
	page: Page;
}): Promise<boolean> => {
	// Strategy 1: Known Stripe selectors
	const submitSelectors = [
		".SubmitButton-IconContainer",
		".SubmitButton",
		"button[type=submit]",
		"[data-testid=hosted-payment-submit-button]",
	];
	for (const sel of submitSelectors) {
		const btn = await page.$(sel);
		if (btn) {
			await btn.evaluate((b) => (b as HTMLElement).click());
			return true;
		}
	}

	// Strategy 2: Find and click by button text content
	const clickedByText = await page.evaluate(() => {
		const candidates = Array.from(document.querySelectorAll("button"));
		const match = candidates.find((b) =>
			/pay|pay now|submit|complete/i.test(b.textContent || ""),
		);
		if (match) {
			(match as HTMLElement).click();
			return true;
		}
		return false;
	});

	return clickedByText;
};
