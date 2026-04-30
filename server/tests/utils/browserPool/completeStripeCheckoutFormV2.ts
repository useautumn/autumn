import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import {
	stripeCheckout,
	type StripeCheckoutBillingAddress,
} from "./playwright/stripeCheckout.js";
import { playwrightPool } from "./playwrightPool.js";

export type { StripeCheckoutBillingAddress };

/**
 * Complete a Stripe Checkout session form.
 * Kernel mode: serializes stripeCheckout via fn.toString() and runs in-VM.
 * Local mode: runs stripeCheckout directly with a local Playwright browser.
 *
 * @param billingAddress - Optional billing address override. Required when
 *   the session was created with `customer_update: { address: "auto" }`
 *   (which makes Stripe Checkout collect a FULL address: line1, city, state,
 *   country, postal_code). When omitted, defaults to US / 10001 — preserving
 *   historical behavior for sessions that only collect postal code.
 */
export const completeStripeCheckoutFormV2 = async ({
	url,
	overrideQuantity,
	promoCode,
	billingAddress,
}: {
	url: string;
	overrideQuantity?: number;
	promoCode?: string;
	billingAddress?: StripeCheckoutBillingAddress;
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
			args: { url, overrideQuantity, promoCode, billingAddress },
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
		args: { url, overrideQuantity, promoCode, billingAddress },
	});

	// If concurrency, wait for 10 more seconds
	if (timeout > 0) {
		await new Promise((resolve) => setTimeout(resolve, timeout));
	}

	console.log("[completeStripeCheckoutFormV2] Done");
};
