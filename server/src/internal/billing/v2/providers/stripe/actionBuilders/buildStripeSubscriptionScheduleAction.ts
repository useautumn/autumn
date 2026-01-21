import type { FullCusProduct } from "@autumn/shared";
import {
	cp,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
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

export type StripeSubscriptionScheduleResult = {
	scheduleAction?: StripeSubscriptionScheduleAction;
	subscriptionCancelAt?: number;
};

/**
 * Builds the subscription schedule action based on add/remove customer products.
 *
 * Returns:
 * - scheduleAction: The schedule action to execute (create, update, or release)
 * - subscriptionCancelAt: If set, the subscription should be canceled at this timestamp (seconds)
 *
 * When there's only one phase starting now + trailing empty phase, this signals a simple cancel.
 * In this case, we release any existing schedule and set cancel_at on the subscription directly.
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
}): StripeSubscriptionScheduleResult => {
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

	const customerProducts = relatedCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct).paid().recurring().hasRelevantStatus().valid,
	);

	const phases = buildStripePhasesUpdate({
		ctx,
		billingContext,
		customerProducts,
		trialEndsAt,
	});

	// Filter out empty phases from both ends - Stripe requires items in every phase
	const scheduledPhases = filterEmptyPhases(phases);

	// Before filtering, check if the original phases end with an empty phase
	// This signals the subscription should cancel at end of the last valid phase
	const lastPhase = phases[phases.length - 1];
	const shouldCancelAtEnd = lastPhase && !phaseHasItems(lastPhase);

	// Determine cancel_at timestamp from the trailing empty phase's start_date
	const cancelAtSeconds =
		shouldCancelAtEnd && typeof lastPhase.start_date === "number"
			? lastPhase.start_date
			: undefined;

	// Simple cancel scenario: only 1 phase with items starting now + trailing empty phase
	// In this case, we don't need a schedule - just set cancel_at on the subscription
	const isSimpleCancel = shouldCancelAtEnd && scheduledPhases.length === 1;

	if (isSimpleCancel) {
		// If schedule exists, release it; otherwise no schedule action needed
		const scheduleAction: StripeSubscriptionScheduleAction | undefined =
			stripeSubscriptionSchedule
				? {
						type: "release",
						stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
					}
				: undefined;

		return {
			scheduleAction,
			subscriptionCancelAt: cancelAtSeconds,
		};
	}

	// No phases with items = no schedule action needed
	// (If subscription is being canceled, the schedule gets canceled automatically by Stripe)
	if (scheduledPhases.length === 0) {
		return {};
	}

	// Multi-phase scenario with existing schedule: update it
	if (stripeSubscriptionSchedule) {
		return {
			scheduleAction: {
				type: "update",
				stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
				params: {
					phases: scheduledPhases,
					end_behavior: shouldCancelAtEnd ? "cancel" : "release",
				},
			},
		};
	}

	// Only 1 phase = no transitions needed, no schedule required
	if (scheduledPhases.length === 1) {
		return {};
	}

	// Multiple phases, no existing schedule: create one
	return {
		scheduleAction: {
			type: "create",
			params: {
				phases: scheduledPhases,
				end_behavior: shouldCancelAtEnd ? "cancel" : "release",
			},
		},
	};
};
