import { fromUnixTime, isAfter } from "date-fns";
import type Stripe from "stripe";
import { schedulePhaseItemShape } from "@/external/stripe/subscriptionSchedules/utils/schedulePhaseItemShape";

export const futurePhaseItemsChanged = ({
	previousPhases,
	currentPhases,
	nowSeconds,
}: {
	previousPhases: Stripe.SubscriptionSchedule.Phase[];
	currentPhases: Stripe.SubscriptionSchedule.Phase[];
	nowSeconds: number;
}): boolean =>
	currentPhases.some((phase, index) => {
		const hasNotStarted = isAfter(
			fromUnixTime(phase.start_date),
			fromUnixTime(nowSeconds),
		);
		if (!hasNotStarted) return false;
		const previous = previousPhases[index];
		return (
			!previous ||
			schedulePhaseItemShape(previous) !== schedulePhaseItemShape(phase)
		);
	});
