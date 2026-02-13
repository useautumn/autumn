import { timeout } from "../genUtils.js";
import { browserPool } from "./browserPool.js";

/**
 * Complete a Stripe 3DS Invoice Confirmation using the shared browser pool.
 * This handles the 3DS authentication challenge flow.
 * Opens a new tab, completes confirmation, and closes the tab (browser stays open).
 */
export const completeInvoiceConfirmation = async ({
	url,
	isLocal = false,
}: {
	url: string;
	isLocal?: boolean;
}): Promise<void> => {
	console.log("[completeInvoiceConfirmation] Starting 3DS confirmation...");

	const page = await browserPool.newPage();

	try {
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
		console.log("[completeInvoiceConfirmation] 3DS confirmation completed");
	} finally {
		// Close the page (tab), but keep browser open for reuse
		await page.close();
	}
};
