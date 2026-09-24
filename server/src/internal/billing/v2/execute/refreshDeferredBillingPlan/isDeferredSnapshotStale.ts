import type { BillingPlan, FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import { isCustomerProductLive } from "./toLiveAutumnBillingPlan";

const updatesReplacedCustomerProduct = ({
	billingPlan,
	fullCustomer,
}: {
	billingPlan: BillingPlan;
	fullCustomer: FullCustomer;
}) => {
	const { updateCustomerProduct, updateCustomerProducts = [] } =
		billingPlan.autumn;

	return [updateCustomerProduct, ...updateCustomerProducts].some(
		(update) =>
			update &&
			!isCustomerProductLive({
				customerProduct: update.customerProduct,
				fullCustomer,
			}),
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

/** It targets a schedule that was replaced, or creates one when the subscription now has one. */
const conflictsWithLiveSchedule = ({
	billingPlan,
	stripeSubscriptionSchedule,
}: {
	billingPlan: BillingPlan;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
}) => {
	const { subscriptionScheduleAction } = billingPlan.stripe;
	if (!subscriptionScheduleAction) return false;

	if (subscriptionScheduleAction.type === "create") {
		return Boolean(stripeSubscriptionSchedule);
	}

	return (
		subscriptionScheduleAction.stripeSubscriptionScheduleId !==
		stripeSubscriptionSchedule?.id
	);
};

/** Whether the customer or subscription changed under a deferred plan since it was computed. */
export const isDeferredSnapshotStale = ({
	billingPlan,
	fullCustomer,
	stripeSubscription,
	stripeSubscriptionSchedule,
}: {
	billingPlan: BillingPlan;
	fullCustomer: FullCustomer;
	stripeSubscription?: Stripe.Subscription;
	stripeSubscriptionSchedule?: Stripe.SubscriptionSchedule;
}) =>
	updatesReplacedCustomerProduct({ billingPlan, fullCustomer }) ||
	conflictsWithLiveSubscriptionItems({ billingPlan, stripeSubscription }) ||
	conflictsWithLiveSchedule({ billingPlan, stripeSubscriptionSchedule });
