import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle";
import { fetchStoredLineItemsForBilling } from "./fetchStoredLineItemsForBilling";
import { getSiblingCusProductIds } from "./getSiblingCusProductIds";

export const fetchStoredLineItemsForSubscriptionBilling = async ({
	db,
	fullCustomer,
	stripeSubscription,
	outgoingCusProductIds,
	excludeStripeInvoiceId,
}: {
	db: DrizzleCli;
	fullCustomer: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
	outgoingCusProductIds: string[];
	excludeStripeInvoiceId?: string;
}) => {
	const siblingIds = getSiblingCusProductIds({
		fullCustomer,
		stripeSubscription,
		excludeIds: outgoingCusProductIds,
	});
	const { storedChargeLineItems, storedRefundLineItems } =
		await fetchStoredLineItemsForBilling({
			db,
			customerProductIds: [...outgoingCusProductIds, ...siblingIds],
		});
	const isKept = (row: { stripe_invoice_id: string | null }) =>
		!excludeStripeInvoiceId || row.stripe_invoice_id !== excludeStripeInvoiceId;
	return {
		storedChargeLineItems: storedChargeLineItems.filter(isKept),
		storedRefundLineItems: storedRefundLineItems.filter(isKept),
	};
};
