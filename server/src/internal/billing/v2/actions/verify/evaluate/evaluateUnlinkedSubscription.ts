import {
	cp,
	type FullCustomer,
	type SubscriptionMismatch,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { VerifySubscriptionTarget } from "../setup/setupVerifyContext";

const isSubscriptionEnding = ({
	subscription,
}: {
	subscription: Stripe.Subscription;
}) =>
	subscription.status === "canceled" ||
	subscription.cancel_at_period_end ||
	subscription.cancel_at !== null;

const holdsMainPlan = ({ target }: { target: VerifySubscriptionTarget }) =>
	target.relatedCusProducts.some(
		(customerProduct) => cp(customerProduct).main().valid,
	);

/**
 * An active Stripe subscription Autumn has no products for. Harmless beside a
 * healthy paid plan; an error when it is the subscription the customer is
 * actually paying on.
 */
export const evaluateUnlinkedSubscription = ({
	fullCustomer,
	targets,
}: {
	fullCustomer: FullCustomer;
	targets: VerifySubscriptionTarget[];
}): SubscriptionMismatch => {
	const endingPlanTarget = targets.find(
		(target) =>
			holdsMainPlan({ target }) &&
			isSubscriptionEnding({ subscription: target.stripeSubscription }),
	);
	if (endingPlanTarget) {
		return {
			type: "plan_on_ending_subscription",
			ending_subscription_id: endingPlanTarget.stripeSubscriptionId,
		};
	}

	const holdsPaidPlan = fullCustomer.customer_products.some(
		(customerProduct) =>
			cp(customerProduct).paid().recurring().hasRelevantStatus().valid,
	);
	if (!holdsPaidPlan) {
		return { type: "stripe_sub_not_in_autumn", severity: "error" };
	}

	return { type: "stripe_sub_not_in_autumn" };
};
