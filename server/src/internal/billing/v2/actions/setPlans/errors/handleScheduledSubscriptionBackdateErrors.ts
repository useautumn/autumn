import {
	type CreateScheduleBillingContext,
	customerProductHasActiveStatus,
} from "@autumn/shared";
import { FIRST_PHASE_TOLERANCE_MS } from "../setup/classifyFirstPhaseStart";
import { filterCustomerProductsInStripeSubscriptionScope } from "../subscriptionScope/isCustomerProductInStripeSubscriptionScope";
import { setPlansError } from "./setPlansError";

/** Re-saving a schedule replays its started phase's date, which never predates any plan that phase runs. */
const startsBeforeLivePlans = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const liveStarts = filterCustomerProductsInStripeSubscriptionScope({
		stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
		customerProducts: billingContext.fullCustomer.customer_products,
	})
		.filter(customerProductHasActiveStatus)
		.map(({ starts_at }) => starts_at);
	if (liveStarts.length === 0) return false;

	return (
		Math.max(...liveStarts) - billingContext.immediatePhase.starts_at >
		FIRST_PHASE_TOLERANCE_MS
	);
};

/** A subscription's schedule can't be rebuilt on a recreated one, so a start earlier than its plans is rejected. */
export const handleScheduledSubscriptionBackdateErrors = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	if (!startsBeforeLivePlans({ billingContext })) return;

	throw setPlansError({
		details: {
			type: "backdate_conflict",
			conflict: "subscription_schedule",
			starts_at: billingContext.immediatePhase.starts_at,
		},
	});
};
