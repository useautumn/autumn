import "dotenv/config";

import { Hyperbrowser } from "@hyperbrowser/sdk";
import puppeteer from "puppeteer-core";
import { timeout } from "../genUtils.js";

const client = new Hyperbrowser({
	apiKey: process.env.HYPERBROWSER_API_KEY,
});

export const completeInvoiceCheckout = async ({
	url,
	isLocal = false,
}: {
	url: string;
	isLocal?: boolean;
}) => {
	let browser: puppeteer.Browser;

	if (process.env.NODE_ENV === "development" && !isLocal) {
		const session = await client.sessions.create();
		browser = await puppeteer.connect({
			browserWSEndpoint: session?.wsEndpoint,
			defaultViewport: null,
		});
	} else {
		browser = await puppeteer.launch({
			headless: false,
			executablePath: "/Applications/Chromium.app/Contents/MacOS/Chromium",
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	}

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
				await postalInput.type("12345");
			}
		} catch (error) {
			console.log("Could not find postal code input:", error);
		}

		// Wait a bit for all inputs to be processed
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const submitButton = await page.$(".SubmitButton-IconContainer");
		await submitButton?.evaluate((b: any) => (b as HTMLElement).click());
		await timeout(20000);
	} finally {
		// always close browser
		await browser.close();
	}
};
