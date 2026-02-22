import "dotenv/config";

import puppeteer, { type Browser } from "puppeteer-core";
import { timeout } from "../genUtils.js";

// const client = new Hyperbrowser({
// 	apiKey: process.env.HYPERBROWSER_API_KEY,
// });

export const completeInvoiceConfirmation = async ({
	url,
	isLocal = false,
}: {
	url: string;
	isLocal?: boolean;
}) => {
	console.log("🔐 Invoice confirmation starting...");
	let browser: Browser;

	// if (process.env.NODE_ENV === "development" && !isLocal) {
	// 	const session = await client.sessions.create();
	// 	browser = await puppeteer.connect({
	// 		browserWSEndpoint: session!.wsEndpoint,
	// 		defaultViewport: null,
	// 	});
	// } else {

	// }
	browser = await puppeteer.launch({
		headless: true,
		executablePath: process.env.TESTS_CHROMIUM_PATH,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-gpu",
		],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 }); // Set standard desktop viewport size
		await page.goto(url);

		// Wait for the page to be ready
		await page.waitForSelector("button", { timeout: 5000 });

		// Find and click the "Confirm payment" button
		const buttonClicked = await page.evaluate(() => {
			const buttons = Array.from(document.querySelectorAll("button"));
			const confirmBtn = buttons.find((b) =>
				/confirm payment/i.test(b.textContent || ""),
			);
			if (confirmBtn) {
				(confirmBtn as HTMLElement).click();
				return true;
			}
			return false;
		});

		if (!buttonClicked) {
			throw new Error("Could not find or click Confirm payment button");
		}

		// Wait for processing/navigation
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Wait for iframe with the three-ds-2-challenge URL
		let threeDSFrame = null;
		for (let i = 0; i < 15; i++) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			const frames = page.frames();

			threeDSFrame = frames.find((f) =>
				f.url().includes("three-ds-2-challenge"),
			);

			if (threeDSFrame) {
				break;
			}
		}

		if (!threeDSFrame) {
			throw new Error("Could not find 3DS challenge frame");
		}

		// Wait for the 3DS frame content to load
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Check for nested iframes
		const frameContent = await threeDSFrame.evaluate(() => {
			return {
				hasButton: !!document.querySelector("#test-source-authorize-3ds"),
				iframes: document.querySelectorAll("iframe").length,
			};
		});

		// If there's a nested iframe, find it
		if (frameContent.iframes > 0) {
			const childFrames = page.frames();
			let challengeFrame = childFrames.find((f) =>
				f.url().includes("3d_secure_2_test"),
			);

			if (!challengeFrame) {
				challengeFrame = childFrames.find((f) => f.name() === "challengeFrame");
			}

			if (challengeFrame) {
				threeDSFrame = challengeFrame;
			}
		}

		// Wait for the button and click it
		await threeDSFrame.waitForSelector("#test-source-authorize-3ds", {
			timeout: 3000,
		});

		await threeDSFrame.evaluate(() => {
			const button = document.querySelector(
				"#test-source-authorize-3ds",
			) as HTMLElement;
			if (button) {
				button.click();
			}
		});

		// Wait for the 3DS authentication to complete
		await timeout(10000);
		console.log("✅ Invoice confirmation completed");
	} finally {
		// always close browser
		await browser.close();
	}
};
