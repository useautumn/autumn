import type { FullCusProduct } from "@autumn/shared";
import {
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	msToSeconds,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { BillingContext } from "@server/internal/billing/v2/billingContext";
import { buildStripePhasesUpdate } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import type Stripe from "stripe";
import type { StripeSubscriptionScheduleAction } from "@/internal/billing/v2/types/billingPlan";

const phaseHasItems = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): boolean => {
	return phase.items !== undefined && phase.items.length > 0;
};

/**
 * Filters out empty phases from both ends.
 * Stripe requires items in every phase.
 */
const filterEmptyPhases = (
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[],
): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
	// Find first non-empty phase
	const firstNonEmptyIndex = phases.findIndex(phaseHasItems);
	if (firstNonEmptyIndex === -1) {
		return [];
	}

	// Find last non-empty phase
	let lastNonEmptyIndex = phases.length - 1;
	while (lastNonEmptyIndex >= 0 && !phaseHasItems(phases[lastNonEmptyIndex])) {
		lastNonEmptyIndex--;
	}

	// Slice to only include phases with items
	const filtered = phases.slice(firstNonEmptyIndex, lastNonEmptyIndex + 1);

	return filtered;
};

/**
 * Builds the subscription schedule action based on add/remove customer products.
 *
 * Returns undefined if no schedule is needed (only 1 phase = no transitions).
 */
export const buildStripeSubscriptionScheduleAction = ({
	ctx,
	billingContext,
	finalCustomerProducts,
	trialEndsAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	finalCustomerProducts: FullCusProduct[];
	trialEndsAt?: number;
}): StripeSubscriptionScheduleAction | undefined => {
	const { stripeSubscriptionSchedule, stripeSubscription } = billingContext;

	// 1. Filter customer products by stripe subscription id or stripe subscription schedule ID?

	const relatedCustomerProducts = finalCustomerProducts.filter(
		(customerProduct) =>
			(stripeSubscription &&
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId: stripeSubscription.id,
				})) ||
			(stripeSubscriptionSchedule &&
				isCustomerProductOnStripeSubscriptionSchedule({
					customerProduct,
					stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
				})),
	);

	const customerProducts = relatedCustomerProducts.filter((customerProduct) =>
		RELEVANT_STATUSES.includes(customerProduct.status),
	);

	const phases = buildStripePhasesUpdate({
		ctx,
		billingContext,
		customerProducts,
		trialEndsAt,
	});

	// Filter out empty phases from both ends - Stripe requires items in every phase
	const scheduledPhases = filterEmptyPhases(phases);

	// No valid phases with items → no schedule needed
	if (scheduledPhases.length === 0) {
		return undefined;
	}

	const nowSeconds = msToSeconds(billingContext.currentEpochMs);
	const firstPhaseStartDate = scheduledPhases[0].start_date as number;
	const startsInFuture = firstPhaseStartDate > nowSeconds;

	// Only 1 phase starting NOW → no schedule needed (direct subscription update instead)
	// Only 1 phase starting in FUTURE → schedule needed to delay start
	if (scheduledPhases.length === 1 && !startsInFuture) {
		return undefined;
	}

	// Case 2: Has existing schedule → update it
	if (stripeSubscriptionSchedule) {
		return {
			type: "update",
			stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
			params: {
				phases: scheduledPhases,
			},
		};
	}

	return {
		type: "create",
		params: {
			// customer: stripeCustomer.id,
			// start_date: startDate,
			phases: scheduledPhases,
			end_behavior: "release",
		},
	};
};
