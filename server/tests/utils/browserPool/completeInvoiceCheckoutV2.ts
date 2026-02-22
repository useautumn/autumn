import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import { invoiceCheckout } from "./playwright/invoiceCheckout.js";
import { playwrightPool } from "./playwrightPool.js";

/**
 * Complete a Stripe Invoice Checkout form.
 * Kernel mode: serializes invoiceCheckout via fn.toString() and runs in-VM.
 * Local mode: runs invoiceCheckout directly with a local Playwright browser.
 */
export const completeInvoiceCheckoutV2 = async ({
	url,
}: {
	url: string;
}): Promise<void> => {
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
