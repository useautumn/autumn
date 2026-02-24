import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import { invoiceConfirmation } from "./playwright/invoiceConfirmation.js";
import { playwrightPool } from "./playwrightPool.js";

/**
 * Complete a Stripe 3DS Invoice Confirmation.
 * Kernel mode: serializes invoiceConfirmation via fn.toString() and runs in-VM.
 * Local mode: runs invoiceConfirmation directly with a local Playwright browser.
 */
export const completeInvoiceConfirmationV2 = async ({
	url,
}: {
	url: string;
}): Promise<void> => {
	if (USE_KERNEL) {
		console.log(
			"[completeInvoiceConfirmationV2] Using Kernel Playwright execution...",
		);
		const sessionId = await browserPool.getSessionId();
		await kernelExecute({
			sessionId,
			fn: invoiceConfirmation,
			args: { url },
		});
		console.log("[completeInvoiceConfirmationV2] Done");
		return;
	}

	// Local — run the same Playwright function with a local browser
	console.log("[completeInvoiceConfirmationV2] Using local Playwright...");
	await playwrightPool.runInPage({ fn: invoiceConfirmation, args: { url } });
	console.log("[completeInvoiceConfirmationV2] Done");
};
