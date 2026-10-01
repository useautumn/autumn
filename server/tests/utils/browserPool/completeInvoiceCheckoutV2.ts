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

/** Stripe marks a submitted payment paid within seconds; still open past this, the page never charged the card. */
const STRIPE_INVOICE_PAID_TIMEOUT_MS = 20_000;
/** Once Stripe says paid, Autumn records it as soon as our `invoice.paid` webhook runs. */
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
		await runInvoiceCheckout({ url, label: customerId });
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
	// Stripe is the truth on whether the page's payment went through, however slow the page is to say so.
	await pollUntilAsserted({
		fetch: () => ctx.stripeCli.invoices.retrieve(stripeInvoiceId),
		assert: (invoice) => {
			if (invoice.status !== "paid") throw new Error("not paid");
		},
		timeoutMs: STRIPE_INVOICE_PAID_TIMEOUT_MS,
		intervalMs: 500,
	}).catch(async () => {
		await dumpStripeDiag({ ctx, customerId, stripeInvoiceId });
	});
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

const dumpStripeDiag = async ({
	ctx,
	customerId,
	stripeInvoiceId,
}: {
	ctx: TestContext;
	customerId: string;
	stripeInvoiceId: string;
}) => {
	const tag = `[DIAG ${customerId}] stripe`;
	try {
		const invoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId, {
			expand: ["payments.data.payment.payment_intent"],
		});
		console.log(
			`${tag} invoice=${JSON.stringify({
				id: invoice.id,
				status: invoice.status,
				collection_method: invoice.collection_method,
				payment_settings: invoice.payment_settings,
				attempt_count: invoice.attempt_count,
				attempted: invoice.attempted,
				amount_due: invoice.amount_due,
				amount_paid: invoice.amount_paid,
				customer_email: invoice.customer_email,
				last_finalization_error: invoice.last_finalization_error,
			})}`,
		);
		console.log(`${tag} payments=${JSON.stringify(invoice.payments)}`.slice(0, 6000));
		const customer = await ctx.stripeCli.customers.retrieve(
			invoice.customer as string,
		);
		console.log(`${tag} customer=${JSON.stringify(customer)}`.slice(0, 2000));
		const pis = await ctx.stripeCli.paymentIntents.list({
			customer: invoice.customer as string,
			limit: 10,
		});
		for (const pi of pis.data) {
			console.log(
				`${tag} pi=${JSON.stringify({
					id: pi.id,
					status: pi.status,
					amount: pi.amount,
					created: pi.created,
					payment_method: pi.payment_method,
					payment_method_types: pi.payment_method_types,
					last_payment_error: pi.last_payment_error,
					next_action: pi.next_action,
					cancellation_reason: pi.cancellation_reason,
				})}`,
			);
		}
		const pms = await ctx.stripeCli.paymentMethods.list({
			customer: invoice.customer as string,
		});
		console.log(
			`${tag} pms=${JSON.stringify(pms.data.map((pm) => ({ id: pm.id, type: pm.type, created: pm.created })))}`,
		);
	} catch (error) {
		console.log(`${tag} dump failed ${error}`);
	}
};

const runInvoiceCheckout = async ({
	url,
	label,
}: {
	url: string;
	label: string;
}): Promise<void> => {
	if (USE_KERNEL) {
		console.log(
			"[completeInvoiceCheckoutV2] Using Kernel Playwright execution...",
		);
		const sessionId = await browserPool.getSessionId();
		await kernelExecute({
			sessionId,
			fn: invoiceCheckout,
			args: { url, label },
		});
		console.log("[completeInvoiceCheckoutV2] Done");
		return;
	}

	// Local — run the same Playwright function with a local browser
	console.log("[completeInvoiceCheckoutV2] Using local Playwright...");
	await playwrightPool.runInPage({
		fn: invoiceCheckout,
		args: { url, label },
	});
	console.log("[completeInvoiceCheckoutV2] Done");
};
