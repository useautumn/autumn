import type Stripe from "stripe";
import { resolvePhaseStartProrationBehavior } from "@/internal/billing/v2/utils/schedulePhaseProration/resolvePhaseStartProrationBehavior";
import type { SchedulePhaseProration } from "../../setup/resolveSchedulePhaseProrations";
import { phaseProrationBehaviorToStripe } from "./phaseProrationBehaviorToStripe";

/** The proration the schedule phase starting here asked for, else the default rule. */
export const resolveStripePhaseProrationBehavior = ({
	phaseProrations,
	phaseStartMs,
	isBillingCycleAnchorResetPhase,
	changesCustomerProducts,
	invoicesPhaseStart,
}: {
	phaseProrations: SchedulePhaseProration[];
	phaseStartMs: number;
	isBillingCycleAnchorResetPhase: boolean;
	changesCustomerProducts: boolean;
	invoicesPhaseStart: boolean;
}):
	| Stripe.SubscriptionScheduleUpdateParams.Phase.ProrationBehavior
	| undefined => {
	const prorationBehavior = resolvePhaseStartProrationBehavior({
		phaseProrations,
		phaseStartMs,
		resetsBillingCycle: isBillingCycleAnchorResetPhase,
		changesCustomerProducts,
	});
	if (prorationBehavior) {
		return phaseProrationBehaviorToStripe({ prorationBehavior });
	}

	return invoicesPhaseStart ? "always_invoice" : undefined;
};
