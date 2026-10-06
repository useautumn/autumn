import type { PhaseProrationBehavior } from "@autumn/shared";
import type Stripe from "stripe";

const STRIPE_PHASE_PRORATION_BEHAVIORS: Record<
	PhaseProrationBehavior,
	Stripe.SubscriptionScheduleUpdateParams.Phase.ProrationBehavior
> = {
	prorate_immediately: "always_invoice",
	none: "none",
};

export const phaseProrationBehaviorToStripe = ({
	prorationBehavior,
}: {
	prorationBehavior: PhaseProrationBehavior;
}) => STRIPE_PHASE_PRORATION_BEHAVIORS[prorationBehavior];
