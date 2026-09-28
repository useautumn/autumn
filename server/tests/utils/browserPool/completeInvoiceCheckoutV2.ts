import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import { invoiceCheckout } from "./playwright/invoiceCheckout.js";
import { playwrightPool } from "./playwrightPool.js";

/** Complete the hosted invoice in an isolated browser context. */
export const completeInvoiceCheckoutV2 = async ({
	url,
	ctx,
	customerId,
}: {
	url: string;
	/** Allows API payment only when Stripe presents an external CAPTCHA challenge. */
	ctx?: TestContext;
	customerId?: string;
}): Promise<void> => {
	try {
		await runInvoiceCheckout({ url });
	} catch (error) {
		const requiresChallenge =
			error instanceof Error && error.name === "StripeBrowserChallengeError";
		if (!requiresChallenge || !ctx || !customerId) throw error;

		console.log(
			`[completeInvoiceCheckoutV2] Hosted page failed (${error}); paying via Stripe API`,
		);
		await payOpenInvoice({ ctx, customerId });
	}
};

const runInvoiceCheckout = async ({ url }: { url: string }): Promise<void> => {
	if (USE_KERNEL) {
		console.log(
			"[completeInvoiceCheckoutV2] Using Kernel Playwright execution...",
		);
		const sessionId = await browserPool.getSessionId();
		await kernelExecute({
			sessionId,
			fn: invoiceCheckout,
			args: { url },
		});
		console.log("[completeInvoiceCheckoutV2] Done");
		return;
	}

	// Local — run the same Playwright function with a local browser
	console.log("[completeInvoiceCheckoutV2] Using local Playwright...");
	await playwrightPool.runInPage({ fn: invoiceCheckout, args: { url } });
	console.log("[completeInvoiceCheckoutV2] Done");
};
