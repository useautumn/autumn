import type { BillingContext } from "@autumn/shared";
import { subscriptionStateAction } from "./subscriptionStateAction";

/** A healthy live subscription is being recreated from a backdated start; it is already paid through its period end. */
export const isBackdateRecreate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		"replacedStripeSubscription" | "subscriptionBackdateStartMs"
	>;
}) => {
	const { replacedStripeSubscription, subscriptionBackdateStartMs } =
		billingContext;
	if (!replacedStripeSubscription) return false;
	if (subscriptionBackdateStartMs === undefined) return false;

	return (
		subscriptionStateAction({ state: replacedStripeSubscription.status })
			.action === "update"
	);
};
