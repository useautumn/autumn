import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import { invoiceConfirmation } from "./playwright/invoiceConfirmation.js";
import { playwrightPool } from "./playwrightPool.js";

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

	console.log("[completeInvoiceConfirmationV2] Using local Playwright...");
	await playwrightPool.runInPage({ fn: invoiceConfirmation, args: { url } });
	console.log("[completeInvoiceConfirmationV2] Done");
};
