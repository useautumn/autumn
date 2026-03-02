import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import { stripeCheckout } from "./playwright/stripeCheckout.js";
import { playwrightPool } from "./playwrightPool.js";

/**
 * Complete a Stripe Checkout session form.
 * Kernel mode: serializes stripeCheckout via fn.toString() and runs in-VM.
 * Local mode: runs stripeCheckout directly with a local Playwright browser.
 */
export const completeStripeCheckoutFormV2 = async ({
	url,
	overrideQuantity,
	promoCode,
}: {
	url: string;
	overrideQuantity?: number;
	promoCode?: string;
}): Promise<void> => {
	const concurrency = Number(process.env.TEST_FILE_CONCURRENCY || "0");
	const timeout = concurrency > 1 ? 10000 : 0; // additional 10 seconds if concurrency
	if (USE_KERNEL) {
		console.log(
			"[completeStripeCheckoutFormV2] Using Kernel Playwright execution...",
		);
		const sessionId = await browserPool.getSessionId();
		await kernelExecute({
			sessionId,
			fn: stripeCheckout,
			args: { url, overrideQuantity, promoCode },
		});
		console.log("[completeStripeCheckoutFormV2] Done");

		if (timeout > 0) {
			await new Promise((resolve) => setTimeout(resolve, timeout));
		}
		return;
	}

	// Local — run the same Playwright function with a local browser
	console.log("[completeStripeCheckoutFormV2] Using local Playwright...");
	await playwrightPool.runInPage({
		fn: stripeCheckout,
		args: { url, overrideQuantity, promoCode },
	});

	// If concurrency, wait for 10 more seconds
	if (timeout > 0) {
		await new Promise((resolve) => setTimeout(resolve, timeout));
	}

	console.log("[completeStripeCheckoutFormV2] Done");
};
