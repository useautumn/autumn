import type { BillingPlan, FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";

const updatesReplacedCustomerProduct = ({
	billingPlan,
	fullCustomer,
}: {
	billingPlan: BillingPlan;
	fullCustomer: FullCustomer;
}) => {
	const { updateCustomerProduct, updateCustomerProducts = [] } =
		billingPlan.autumn;
	const liveIds = new Set(
		fullCustomer.customer_products.map((customerProduct) => customerProduct.id),
	);

	return [updateCustomerProduct, ...updateCustomerProducts].some(
		(update) => update && !liveIds.has(update.customerProduct.id),
	);
};

/** Items it deletes are gone, or prices it adds are already there: Stripe would reject the replay. */
const conflictsWithLiveSubscriptionItems = ({
	billingPlan,
	stripeSubscription,
}: {
	billingPlan: BillingPlan;
	stripeSubscription?: Stripe.Subscription;
}) => {
	const { subscriptionAction } = billingPlan.stripe;
	if (subscriptionAction?.type !== "update" || !stripeSubscription) {
		return false;
	}

	const liveItems = stripeSubscription.items.data;
	const liveItemIds = new Set(liveItems.map((item) => item.id));
	const livePriceIds = new Set(liveItems.map((item) => item.price.id));

	return (subscriptionAction.params.items ?? []).some((item) =>
		item.id ? !liveItemIds.has(item.id) : livePriceIds.has(item.price ?? ""),
	);
};

/** Whether the customer or subscription changed under a deferred plan since it was computed. */
export const isDeferredSnapshotStale = ({
	billingPlan,
	fullCustomer,
	stripeSubscription,
}: {
	billingPlan: BillingPlan;
	fullCustomer: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
}) =>
	updatesReplacedCustomerProduct({ billingPlan, fullCustomer }) ||
	conflictsWithLiveSubscriptionItems({ billingPlan, stripeSubscription });
