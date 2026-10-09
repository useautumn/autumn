import {
	type FullCustomer,
	filterCustomerProductsByStripeSubscriptionId,
	isCustomerProductScheduled,
	stripeRefToId,
} from "@autumn/shared";
import type Stripe from "stripe";
import { endsOnSchedulePhase } from "./endsOnSchedulePhase";
import type { SchedulePhaseRows } from "./types/schedulePhaseRows";

/** A released schedule hands its subscription back under released_subscription. */
const scheduleSubscriptionId = (schedule: Stripe.SubscriptionSchedule) =>
	schedule.released_subscription ?? stripeRefToId(schedule.subscription);

export const computeDetachSchedulePhases = ({
	fullCustomer,
	schedule,
}: {
	fullCustomer: FullCustomer;
	schedule: Stripe.SubscriptionSchedule;
}): SchedulePhaseRows => {
	const scheduledRows = fullCustomer.customer_products.filter(
		(customerProduct) =>
			isCustomerProductScheduled(customerProduct) &&
			customerProduct.scheduled_ids?.includes(schedule.id),
	);
	const phaseEndRows = filterCustomerProductsByStripeSubscriptionId({
		customerProducts: fullCustomer.customer_products,
		stripeSubscriptionId: scheduleSubscriptionId(schedule),
	}).filter((customerProduct) =>
		endsOnSchedulePhase({ customerProduct, schedule }),
	);

	return { scheduledRows, phaseEndRows };
};
