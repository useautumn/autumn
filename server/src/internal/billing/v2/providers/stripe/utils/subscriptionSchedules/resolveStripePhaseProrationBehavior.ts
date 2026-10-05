import type { FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { phaseProrationBehaviorToStripe } from "./phaseProrationBehaviorToStripe";

const findRequestedProrationBehavior = ({
	phaseCustomerProducts,
	phaseStartMs,
}: {
	phaseCustomerProducts: FullCusProduct[];
	phaseStartMs: number;
}) =>
	phaseCustomerProducts.find(
		(customerProduct) =>
			customerProduct.starts_at === phaseStartMs &&
			customerProduct.phase_proration_behavior,
	)?.phase_proration_behavior;

/** The proration a plan starting with the phase asked for, else the default rule. */
export const resolveStripePhaseProrationBehavior = ({
	phaseCustomerProducts,
	phaseStartMs,
	isBillingCycleAnchorResetPhase,
	changesCustomerProducts,
	invoicesPhaseStart,
}: {
	phaseCustomerProducts: FullCusProduct[];
	phaseStartMs: number;
	isBillingCycleAnchorResetPhase: boolean;
	changesCustomerProducts: boolean;
	invoicesPhaseStart: boolean;
}):
	| Stripe.SubscriptionScheduleUpdateParams.Phase.ProrationBehavior
	| undefined => {
	const requestedProrationBehavior = findRequestedProrationBehavior({
		phaseCustomerProducts,
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
