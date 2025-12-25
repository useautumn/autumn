import "dotenv/config";

import puppeteer, { type Browser } from "puppeteer-core";
import { timeout } from "../genUtils.js";

// const client = new Hyperbrowser({
// 	apiKey: process.env.HYPERBROWSER_API_KEY,
// });

export const completeInvoiceCheckout = async ({
	url,
	isLocal = false,
}: {
	url: string;
	isLocal?: boolean;
}) => {
	let browser: Browser;

	browser = await puppeteer.launch({
		headless: true,
		executablePath: process.env.TESTS_CHROMIUM_PATH,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 }); // Set standard desktop viewport size
		await page.goto(url);

		// Wait for the payment element to load

		await page.waitForSelector("#payment-element", { timeout: 10000 });

		// Wait a bit more for the iframe to fully load
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Try clicking on the payment element container to expand the accordion

		await page.click("#payment-element");

		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Get the iframe containing the Stripe elements
		const stripeFrame = await page.$("#payment-element iframe");
		if (!stripeFrame) {
			throw new Error("Stripe iframe not found");
		}

		const frame = await stripeFrame.contentFrame();
		if (!frame) {
			throw new Error("Could not access iframe content");
		}

		// Expand the Card accordion inside the Stripe Payment Element if collapsed
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
					// wait for the card form fields to render
					await frame.waitForSelector(
						'input[name="number"], input[data-elements-stable-field-name="cardNumber"], input[aria-label*="Card number"]',
						{ timeout: 5000 },
					);
				}
			}
		} catch (error) {
			console.log("Could not expand card accordion, proceeding:", error);
		}

		// Enter card number - try different possible selectors
		try {
			await frame.waitForSelector(
				'input[name="number"], input[data-elements-stable-field-name="cardNumber"], input[placeholder*="1234"], input[aria-label*="Card number"]',
				{ timeout: 2000 },
			);
			const cardNumberInput = await frame.$(
				'input[name="number"], input[data-elements-stable-field-name="cardNumber"], input[placeholder*="1234"], input[aria-label*="Card number"]',
			);
			if (cardNumberInput) {
				await cardNumberInput.click();
				await cardNumberInput.type("4242424242424242");
			}
		} catch (error) {
			console.log("Could not find card number input:", error);
		}

		// Enter expiry date
		try {
			await frame.waitForSelector(
				'input[name="expiry"], input[data-elements-stable-field-name="cardExpiry"], input[placeholder*="MM"], input[aria-label*="expir"]',
				{ timeout: 2000 },
			);
			const expiryInput = await frame.$(
				'input[name="expiry"], input[data-elements-stable-field-name="cardExpiry"], input[placeholder*="MM"], input[aria-label*="expir"]',
			);
			if (expiryInput) {
				await expiryInput.click();
				await expiryInput.type("1227");
			}
		} catch (error) {
			console.log("Could not find expiry input:", error);
		}

		// Enter CVC
		try {
			await frame.waitForSelector(
				'input[name="cvc"], input[data-elements-stable-field-name="cardCvc"], input[placeholder*="CVC"], input[aria-label*="CVC"]',
				{ timeout: 2000 },
			);
			const cvcInput = await frame.$(
				'input[name="cvc"], input[data-elements-stable-field-name="cardCvc"], input[placeholder*="CVC"], input[aria-label*="CVC"]',
			);
			if (cvcInput) {
				await cvcInput.click();
				await cvcInput.type("123");
			}
		} catch (error) {
			console.log("Could not find CVC input:", error);
		}

		// Enter postal code
		try {
			await frame.waitForSelector(
				'input[name="postalCode"], input[data-elements-stable-field-name="postalCode"], input[placeholder*="12345"], input[aria-label*="ZIP"]',
				{ timeout: 2000 },
			);
			const postalInput = await frame.$(
				'input[name="postalCode"], input[data-elements-stable-field-name="postalCode"], input[placeholder*="12345"], input[aria-label*="ZIP"]',
			);
			if (postalInput) {
				await postalInput.click();
				await postalInput.type("94107");
			}
		} catch (error) {
			console.log("Could not find postal code input:", error);
		}

		// Wait a bit for all inputs to be processed
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Click submit/pay button with robust fallbacks
		let clicked = false;
		const submitSelectors = [
			".SubmitButton-IconContainer",
			".SubmitButton",
			"button[type=submit]",
			"[data-testid=hosted-payment-submit-button]",
		];
		for (const sel of submitSelectors) {
			const btn = await page.$(sel);
			if (btn) {
				await btn.evaluate((b: any) => (b as HTMLElement).click());
				clicked = true;
				break;
			}
		}
		if (!clicked) {
			try {
				const handle: any = await page.evaluateHandle(() => {
					const candidates = Array.from(document.querySelectorAll("button"));
					return (
						candidates.find((b) =>
							/pay|pay now|submit|complete/i.test(b.textContent || ""),
						) || null
					);
				});
				if (handle) {
					await handle.evaluate((b: any) => (b as HTMLElement).click());
					clicked = true;
				}
			} catch (e) {
				console.log("Could not find submit button by text:", e);
			}
		}
		await timeout(20000);
	} finally {
		// always close browser
		await browser.close();
	}
};
