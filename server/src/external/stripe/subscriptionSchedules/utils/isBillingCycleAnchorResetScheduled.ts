import { secondsToMs, timestampsMatch } from "@autumn/shared";
import type Stripe from "stripe";

export const isBillingCycleAnchorResetScheduled = ({
	resetsAt,
	stripeSubscriptionSchedule,
}: {
	resetsAt: number;
	stripeSubscriptionSchedule:
		| Pick<Stripe.SubscriptionSchedule, "phases">
		| null
		| undefined;
}): boolean =>
	(stripeSubscriptionSchedule?.phases ?? []).some(
		(phase) =>
			phase.billing_cycle_anchor === "phase_start" &&
			timestampsMatch(secondsToMs(phase.start_date), resetsAt),
	);
