import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

/**
 * Vercel-specific Stripe invoice-mode helpers.
 *
 * Vercel marketplace customers can't use Stripe's third-party payment
 * processing (Custom Payment Methods + Payment Records) on every Stripe plan.
 * Instead, Vercel subscriptions/invoices use Stripe as the ledger
 * (`collection_method: "send_invoice"`) while Vercel itself moves money.
 *
 * These helpers are idempotent and safe to call from webhooks.
 */

/**
 * Detect whether a Stripe subscription belongs to a Vercel installation.
 */
export const isVercelStripeSubscription = (
	subscription: Stripe.Subscription | null | undefined,
): boolean => {
	if (!subscription) return false;
	return Boolean(subscription.metadata?.vercel_installation_id);
};

/**
 * Ensure a Vercel-owned Stripe subscription is in invoice mode
 * (`send_invoice` + `days_until_due: 30`).
 *
 * - No-op if already `send_invoice`.
 * - Best-effort clears `default_payment_method` (`default_payment_method`
 *   is not typed as nullable on `SubscriptionUpdateParams`, so we cast to
 *   `unknown` and treat any rejection as non-fatal).
 * - Skips silently if the subscription is canceled.
 */
export const ensureVercelInvoiceModeSubscription = async ({
	ctx,
	stripeCli,
	subscription,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	subscription: Stripe.Subscription;
}): Promise<Stripe.Subscription> => {
	const { logger } = ctx;

	if (!isVercelStripeSubscription(subscription)) {
		return subscription;
	}

	if (
		subscription.status === "canceled" ||
		subscription.status === "incomplete_expired"
	) {
		return subscription;
	}

	if (subscription.collection_method === "send_invoice") {
		return subscription;
	}

	try {
		// `default_payment_method` is not typed as nullable on the update
		// params, but Stripe accepts null at runtime to clear it. Failure to
		// clear is non-fatal — invoice mode itself is the durable fix.
		const updated = await stripeCli.subscriptions.update(subscription.id, {
			collection_method: "send_invoice",
			days_until_due: 30,
			default_payment_method: null as unknown as string | undefined,
		});

		logger.info("[vercelInvoiceMode] migrated subscription to send_invoice", {
			data: {
				subscriptionId: subscription.id,
				previousCollectionMethod: subscription.collection_method,
			},
		});

		return updated;
	} catch (error: any) {
		logCaughtError({
			logger,
			message:
				"[vercelInvoiceMode] failed to clear default_payment_method; retrying invoice mode migration",
			error,
			data: { subscriptionId: subscription.id },
			level: "warn",
		});

		// Retry without clearing default_payment_method if Stripe rejected it.
		// The collection_method flip is the important part.
		try {
			const updated = await stripeCli.subscriptions.update(subscription.id, {
				collection_method: "send_invoice",
				days_until_due: 30,
			});

			logger.warn(
				"[vercelInvoiceMode] migrated subscription to send_invoice; could not clear default_payment_method",
				{
					data: {
						subscriptionId: subscription.id,
						error: error?.message,
					},
				},
			);

			return updated;
		} catch (retryError: any) {
			logCaughtError({
				logger,
				message:
					"[vercelInvoiceMode] failed to migrate subscription to send_invoice",
				error: retryError,
				data: { subscriptionId: subscription.id },
			});
			return subscription;
		}
	}
};

/**
 * Strip a Vercel-owned Stripe customer's default payment method when it
 * points at a Custom Payment Method. Required before `invoices.pay` —
 * Stripe rejects the call with "Custom payment methods are not supported
 * on invoices.pay" if the customer's default is a CPM.
 *
 * Clears `invoice_settings.default_payment_method` only; the CPM stays
 * attached so historical invoices/payment records that reference it keep
 * resolving. Idempotent + best-effort: a real card stays untouched, a
 * non-CPM default is left alone, and Stripe failures log a warning
 * without throwing.
 */
export const ensureVercelInvoiceModeCustomer = async ({
	ctx,
	stripeCli,
	stripeCustomerId,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	stripeCustomerId: string;
}): Promise<void> => {
	const { logger } = ctx;

	try {
		const customer = await stripeCli.customers.retrieve(stripeCustomerId, {
			expand: ["invoice_settings.default_payment_method"],
		});

		if (customer.deleted) return;

		const defaultPm = customer.invoice_settings?.default_payment_method;
		if (!defaultPm || typeof defaultPm === "string") return;

		if (defaultPm.type !== "custom") return;

		await stripeCli.customers.update(stripeCustomerId, {
			invoice_settings: {
				default_payment_method: "" as unknown as string,
			},
		});

		logger.info(
			"[vercelInvoiceMode] cleared CPM as customer default payment method",
			{
				data: {
					stripeCustomerId,
					paymentMethodId: defaultPm.id,
				},
			},
		);
	} catch (error: any) {
		logCaughtError({
			logger,
			message:
				"[vercelInvoiceMode] failed to clear customer-level CPM default",
			error,
			data: { stripeCustomerId },
			level: "warn",
		});
	}
};

/**
 * Mark a Stripe invoice paid out of band (Vercel handled the money movement).
 *
 * Idempotent:
 * - Skips if the invoice is already `paid`.
 * - Skips if the invoice is `void`/`voided`/`uncollectible`/`deleted`.
 * - Logs and continues for known race/already-paid states.
 */
export const markVercelInvoicePaidOutOfBand = async ({
	ctx,
	stripeCli,
	invoice,
}: {
	ctx: AutumnContext;
	stripeCli: Stripe;
	invoice: Stripe.Invoice;
}): Promise<Stripe.Invoice> => {
	const { logger } = ctx;

	if (!invoice.id) {
		return invoice;
	}

	if (invoice.status === "paid") {
		logger.info("[vercelInvoiceMode] invoice already paid, skipping", {
			data: { invoiceId: invoice.id },
		});
		return invoice;
	}

	if (invoice.status === "void" || invoice.status === "uncollectible") {
		logger.info("[vercelInvoiceMode] invoice not payable, skipping", {
			data: { invoiceId: invoice.id, status: invoice.status },
		});
		return invoice;
	}

	if (invoice.status === "draft") {
		// `invoices.pay` requires a finalized invoice. The finalize webhook is
		// what triggers Vercel submission; by the time `marketplace.invoice.paid`
		// lands, the invoice should be `open`. If it's still `draft`, log and
		// skip — finalization will happen in a separate webhook.
		logger.warn(
			"[vercelInvoiceMode] invoice still draft when paid webhook arrived",
			{ data: { invoiceId: invoice.id } },
		);
		return invoice;
	}

	try {
		return await stripeCli.invoices.pay(invoice.id, {
			paid_out_of_band: true,
		});
	} catch (error: any) {
		const message: string = error?.message ?? "";

		if (
			message.includes("already paid") ||
			message.includes("This invoice is already paid")
		) {
			logCaughtError({
				logger,
				message: "[vercelInvoiceMode] invoice already paid (race)",
				error,
				data: { invoiceId: invoice.id },
				level: "warn",
			});
			return invoice;
		}

		if (
			message.includes("voided") ||
			message.includes("uncollectible") ||
			message.includes("Cannot pay invoice")
		) {
			logCaughtError({
				logger,
				message:
					"[vercelInvoiceMode] invoice transitioned to non-payable state",
				error,
				data: { invoiceId: invoice.id },
				level: "warn",
			});
			return invoice;
		}

		logCaughtError({
			logger,
			message: "[vercelInvoiceMode] failed to mark invoice paid out of band",
			error,
			data: { invoiceId: invoice.id },
		});
		throw error;
	}
};
