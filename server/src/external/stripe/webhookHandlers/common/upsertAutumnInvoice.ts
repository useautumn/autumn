import {
	cp,
	cusProductToProduct,
	deduplicateArray,
	type FullCusProduct,
} from "@autumn/shared";
import type Stripe from "stripe";
import {
	stripeSubscriptionToNowMs,
	stripeSubscriptionToScheduleId,
} from "@/external/stripe/subscriptions";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { invoiceActions } from "@/internal/invoices/actions";
import type { InvoiceUpsertResult } from "@/internal/invoices/actions/types/invoiceUpsertResult";

/** Returns the saved invoice and cache patch outcome so callers can decide whether refresh is needed. */
export const upsertAutumnInvoice = async ({
	ctx,
	stripeInvoice,
	stripeSubscription,
	customerProducts,
	options,
}: {
	ctx: StripeWebhookContext;
	stripeInvoice: Stripe.Invoice;
	stripeSubscription?: Stripe.Subscription;
	customerProducts?: FullCusProduct[];
	options?: {
		skipNonCycleInvoices?: boolean;
		// skipSubscriptionCreateInvoice?: boolean;
	};
}): Promise<InvoiceUpsertResult | undefined> => {
	const { logger, stripeCli, fullCustomer } = ctx;

	// 1. Skip non-cycle invoices if requested (invoice.created uses this)
	if (
		options?.skipNonCycleInvoices &&
		stripeInvoice.billing_reason !== "subscription_cycle"
	) {
		logger.info(
			`[upsertAutumnInvoice] Skipping non-cycle invoice (billing_reason: ${stripeInvoice.billing_reason})`,
		);
		return undefined;
	}

	if (!fullCustomer) {
		logger.warn(
			`[upsertAutumnInvoice] No fullCustomer, cannot create invoice ${stripeInvoice.id}`,
		);
		return undefined;
	}

	// 4. Get nowMs (test-clock aware)
	const nowMs = stripeSubscription
		? await stripeSubscriptionToNowMs({
				stripeSubscription,
				stripeCli,
			})
		: Date.now();

	// 5. Merge scheduled-but-started customer products
	const scheduleId = stripeSubscriptionToScheduleId({ stripeSubscription });

	const startedScheduledCustomerProducts = (
		fullCustomer.customer_products ?? []
	).filter((customerProduct) => {
		const { valid: hasStarted } = cp(customerProduct)
			.onStripeSubscription({
				stripeSubscriptionId: stripeSubscription?.id ?? "",
			})
			.or.onStripeSchedule({
				stripeSubscriptionScheduleId: scheduleId ?? undefined,
			})
			.scheduled()
			.hasStarted({ nowMs });

		return hasStarted;
	});

	const allCustomerProducts = [
		...(customerProducts ?? []),
		...startedScheduledCustomerProducts,
	];

	const internalEntityIds = deduplicateArray(
		allCustomerProducts.map((cp) => cp.internal_entity_id),
	);
	const internalEntityId =
		internalEntityIds.length === 1 ? internalEntityIds[0] : null;

	// 8. Create new invoice
	return invoiceActions.upsertFromStripe({
		ctx,
		stripeInvoice,
		fullCustomer,
		fullProducts: allCustomerProducts.map((cp) =>
			cusProductToProduct({ cusProduct: cp }),
		),
		internalEntityId: internalEntityId ?? undefined,
	});
};
