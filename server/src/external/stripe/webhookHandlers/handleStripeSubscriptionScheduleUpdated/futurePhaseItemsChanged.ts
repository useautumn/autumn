import { fromUnixTime, isAfter } from "date-fns";
import type Stripe from "stripe";
import { schedulePhaseItemShape } from "@/external/stripe/subscriptionSchedules/utils/schedulePhaseItemShape";

/** True when a phase that has not started yet changed price or quantity.
 * Phases pair by index (the caller has ruled out a phase count change), so a
 * phase moved to a new date with the same items is not an edit. */
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
