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

const STRIPE_INVOICE_PAID_TIMEOUT_MS = 20_000;
const AUTUMN_INVOICE_PAID_TIMEOUT_MS = 15_000;

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
		const requiresChallenge =
			error instanceof Error && error.name === "StripeBrowserChallengeError";
		if (!requiresChallenge) throw error;

		console.log(
			`[completeInvoiceCheckoutV2] Hosted page failed (${error}); paying via Stripe API`,
		);
		await payOpenInvoice({ ctx, customerId });
	}
	await pollUntilAsserted({
		fetch: () => ctx.stripeCli.invoices.retrieve(stripeInvoiceId),
		assert: (invoice) => {
			if (invoice.status !== "paid")
				throw new Error(
					`Stripe invoice is still ${invoice.status}: the hosted-page payment never went through`,
				);
		},
		timeoutMs: STRIPE_INVOICE_PAID_TIMEOUT_MS,
		intervalMs: 500,
	});
	await pollUntilAsserted({
		fetch: () =>
			InvoiceService.getByStripeId({ db: ctx.db, stripeId: stripeInvoiceId }),
		assert: (invoice) => {
			if (invoice?.status !== InvoiceStatus.Paid)
				throw new Error(
					`Stripe invoice is paid but Autumn's is ${invoice?.status}: the invoice.paid webhook was not handled`,
				);
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

	console.log("[completeInvoiceCheckoutV2] Using local Playwright...");
	await playwrightPool.runInPage({ fn: invoiceCheckout, args: { url } });
	console.log("[completeInvoiceCheckoutV2] Done");
};
