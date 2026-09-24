import {
	type FullCusProduct,
	isCustomerProductScheduled,
} from "@autumn/shared";
import { differenceInMilliseconds, fromUnixTime } from "date-fns";
import type Stripe from "stripe";

const STRIPE_SECOND_PRECISION_MS = 1000;

const schedulePhaseBoundaries = (schedule: Stripe.SubscriptionSchedule) =>
	schedule.phases.flatMap((phase) =>
		[phase.start_date, phase.end_date]
			.filter((seconds): seconds is number => typeof seconds === "number")
			.map((seconds) => fromUnixTime(seconds)),
	);

/**
 * A live plan whose end date is one of the schedule's phase boundaries. An
 * end date set for any other reason (a canceling subscription, an add-on
 * with its own ends_at) is left untouched.
 */
export const endsOnSchedulePhase = ({
	customerProduct,
	schedule,
}: {
	customerProduct: FullCusProduct;
	schedule: Stripe.SubscriptionSchedule;
}) => {
	if (isCustomerProductScheduled(customerProduct)) return false;
	if (customerProduct.canceled) return false;
	if (customerProduct.ended_at == null) return false;

	const endedAt = new Date(customerProduct.ended_at);
	return schedulePhaseBoundaries(schedule).some(
		(boundary) =>
			Math.abs(differenceInMilliseconds(boundary, endedAt)) <
			STRIPE_SECOND_PRECISION_MS,
	);
};
