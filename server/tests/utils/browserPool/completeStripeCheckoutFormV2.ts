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
 * Complete a Stripe Checkout session form (Kernel VM or local Playwright).
 * Pass `billingAddress` when the session was created with
 * `customer_update: { address: "auto" }` (full address form). Defaults to
 * US / 10001 (postal-code-only sessions).
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
	const timeout = concurrency > 1 ? 10000 : 0;
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

	console.log("[completeStripeCheckoutFormV2] Using local Playwright...");
	await playwrightPool.runInPage({
		fn: stripeCheckout,
		args: { url, overrideQuantity, promoCode, billingAddress },
	});

	if (timeout > 0) {
		await new Promise((resolve) => setTimeout(resolve, timeout));
	}

	console.log("[completeStripeCheckoutFormV2] Done");
};
