import {
	type BillingContext,
	cp,
	isCustomerProductOnStripeSubscription,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductToLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToLineItems";

/** One subscription item: a price billed for an entity at a quantity. */
const subscriptionItemKey = (lineItem: LineItem) =>
	[
		lineItem.context.price.id,
		lineItem.context.customerProduct?.internal_entity_id ?? "",
		lineItem.totalQuantity ?? 1,
	].join(":");

/** What the live subscription bills each period, as new-period charge lines. */
const liveSubscriptionChargeLines = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}) => {
	const { stripeSubscription, fullCustomer } = billingContext;
	if (!stripeSubscription) return [];
	return fullCustomer.customer_products
		.filter(
			(customerProduct) =>
				cp(customerProduct).hasActiveStatus().valid &&
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId: stripeSubscription.id,
				}) === true,
		)
		.flatMap((customerProduct) =>
			customerProductToLineItems({
				ctx,
				customerProduct,
				billingContext,
				direction: "charge",
				priceFilters: { excludeOneOffPrices: true },
			}),
		);
};

/** Drops new-period charges for items the live subscription already bills at the same quantity. */
export const dropUnchangedSubscriptionItemCharges = ({
	ctx,
	lineItems,
	billingContext,
}: {
	ctx: AutumnContext;
	lineItems: LineItem[];
	billingContext: BillingContext;
}) => {
	const unmatchedLiveItems = liveSubscriptionChargeLines({
		ctx,
		billingContext,
	}).map(subscriptionItemKey);

	return lineItems.filter((lineItem) => {
		const isNewPeriodCharge =
			lineItem.context.direction === "charge" &&
			lineItem.context.billingTiming === "in_advance";
		if (!isNewPeriodCharge) return true;
		const liveItemIndex = unmatchedLiveItems.indexOf(
			subscriptionItemKey(lineItem),
		);
		if (liveItemIndex === -1) return true;
		unmatchedLiveItems.splice(liveItemIndex, 1);
		return false;
	});
};
