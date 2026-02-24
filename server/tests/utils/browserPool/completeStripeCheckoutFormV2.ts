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
		return;
	}

	// Local — run the same Playwright function with a local browser
	console.log("[completeStripeCheckoutFormV2] Using local Playwright...");
	await playwrightPool.runInPage({
		fn: stripeCheckout,
		args: { url, overrideQuantity, promoCode },
	});
	console.log("[completeStripeCheckoutFormV2] Done");
};
