import { expect } from "bun:test";
import { InvoiceStatus } from "@autumn/shared";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import { openStripeInvoiceId } from "@tests/utils/stripeUtils/openStripeInvoiceId";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";
import { USE_KERNEL } from "./browserConfig.js";
import { browserPool } from "./browserPool.js";
import { kernelExecute } from "./kernelExecute.js";
import { invoiceCheckout } from "./playwright/invoiceCheckout.js";
import { playwrightPool } from "./playwrightPool.js";

/** Stripe's webhook reaches Autumn seconds after the page confirms; a real failure still ends well inside this. */
const AUTUMN_INVOICE_PAID_TIMEOUT_MS = 15_000;

/**
 * Pays the customer's open invoice on its hosted page, then waits until Autumn has handled `invoice.paid`.
 * Autumn marks its invoice paid last, after attaching the plan, so every later read sees the payment.
 */
export const completeInvoiceCheckoutV2 = async ({
	url,
	ctx,
	customerId,
}: {
	url: string;
	ctx: TestContext;
	customerId: string;
}): Promise<void> => {
	const stripeInvoiceId = await openStripeInvoiceId({ ctx, customerId });
	try {
		await runInvoiceCheckout({ url });
	} catch (error) {
		// Only an external CAPTCHA challenge falls back to paying through the Stripe API.
		const requiresChallenge =
			error instanceof Error && error.name === "StripeBrowserChallengeError";
		if (!requiresChallenge) throw error;

		console.log(
			`[completeInvoiceCheckoutV2] Hosted page failed (${error}); paying via Stripe API`,
		);
		await payOpenInvoice({ ctx, customerId });
	}
	await pollUntilAsserted({
		fetch: () =>
			InvoiceService.getByStripeId({ db: ctx.db, stripeId: stripeInvoiceId }),
		assert: (invoice) => {
			expect(invoice?.status).toBe(InvoiceStatus.Paid);
		},
		timeoutMs: AUTUMN_INVOICE_PAID_TIMEOUT_MS,
		intervalMs: 500,
	});
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
