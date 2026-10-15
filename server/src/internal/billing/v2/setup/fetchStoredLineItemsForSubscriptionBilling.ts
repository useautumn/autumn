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
	excludeStripeInvoiceId?: string | null;
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
	const notExcluded = ({
		stripe_invoice_id,
	}: {
		stripe_invoice_id: string | null;
	}) => !excludeStripeInvoiceId || stripe_invoice_id !== excludeStripeInvoiceId;
	return {
		storedChargeLineItems: storedChargeLineItems.filter(notExcluded),
		storedRefundLineItems: storedRefundLineItems.filter(notExcluded),
	};
};
