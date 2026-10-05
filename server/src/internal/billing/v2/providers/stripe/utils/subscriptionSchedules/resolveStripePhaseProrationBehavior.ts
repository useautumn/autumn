import { truncateMsToSecondPrecision } from "@autumn/shared";
import type Stripe from "stripe";
import type { SchedulePhaseProration } from "../../setup/resolveSchedulePhaseProrations";
import { phaseProrationBehaviorToStripe } from "./phaseProrationBehaviorToStripe";

const findRequestedProrationBehavior = ({
	phaseProrations,
	phaseStartMs,
}: {
	phaseProrations: SchedulePhaseProration[];
	phaseStartMs: number;
}) =>
	phaseProrations.find(
		({ startsAt }) => truncateMsToSecondPrecision(startsAt) === phaseStartMs,
	)?.prorationBehavior;

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
	const requestedProrationBehavior = findRequestedProrationBehavior({
		phaseProrations,
		phaseStartMs,
	});
	if (requestedProrationBehavior) {
		return phaseProrationBehaviorToStripe({
			prorationBehavior: requestedProrationBehavior,
		});
	}

	// Product switches at a reset start a full cycle without old-plan credits.
	if (isBillingCycleAnchorResetPhase && changesCustomerProducts) return "none";
	return invoicesPhaseStart ? "always_invoice" : undefined;
};
