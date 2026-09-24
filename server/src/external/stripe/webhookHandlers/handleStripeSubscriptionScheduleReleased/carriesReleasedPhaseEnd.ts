import {
	type FullCusProduct,
	isCustomerProductScheduled,
} from "@autumn/shared";
import type Stripe from "stripe";

const STRIPE_SECOND_PRECISION_MS = 1000;

const scheduleBoundariesMs = (schedule: Stripe.SubscriptionSchedule) =>
	schedule.phases.flatMap((phase) =>
		[phase.start_date, phase.end_date]
			.filter((seconds): seconds is number => typeof seconds === "number")
			.map((seconds) => seconds * 1000),
	);

/**
 * A live plan whose end date is one of the released schedule's phase
 * boundaries. An end date set for any other reason (a canceling
 * subscription, an add-on with its own ends_at) is left untouched.
 */
export const carriesReleasedPhaseEnd = ({
	customerProduct,
	schedule,
}: {
	customerProduct: FullCusProduct;
	schedule: Stripe.SubscriptionSchedule;
}) => {
	if (isCustomerProductScheduled(customerProduct)) return false;
	if (customerProduct.canceled) return false;
	const endedAt = customerProduct.ended_at;
	if (endedAt == null) return false;

	return scheduleBoundariesMs(schedule).some(
		(boundaryMs) => Math.abs(boundaryMs - endedAt) < STRIPE_SECOND_PRECISION_MS,
	);
};
