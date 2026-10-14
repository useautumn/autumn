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
	};
}): Promise<InvoiceUpsertResult | undefined> => {
	const { logger, stripeCli, fullCustomer } = ctx;

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

	const nowMs = stripeSubscription
		? await stripeSubscriptionToNowMs({
				stripeSubscription,
				stripeCli,
			})
		: Date.now();

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
