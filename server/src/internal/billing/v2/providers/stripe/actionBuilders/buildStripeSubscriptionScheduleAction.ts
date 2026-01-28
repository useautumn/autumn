import type { FullCusProduct } from "@autumn/shared";
import {
	cp,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/types";
import { buildStripePhasesUpdate } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import type Stripe from "stripe";
import type { StripeSubscriptionScheduleAction } from "@/internal/billing/v2/types";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type StripeSubscriptionScheduleResult = {
	scheduleAction?: StripeSubscriptionScheduleAction;
	subscriptionCancelAt?: number;
};

/**
 * The 4 possible scenarios for subscription schedule actions:
 * - no_phases: No phases with items, nothing to do
 * - single_indefinite: 1 phase with no end_date (e.g., uncancel)
 * - simple_cancel: 1 phase + trailing empty (cancel at end of cycle)
 * - multi_phase: Multiple phases requiring a schedule
 */
type ScheduleScenario =
	| "no_phases"
	| "single_indefinite"
	| "simple_cancel"
	| "multi_phase";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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
	const firstNonEmptyIndex = phases.findIndex(phaseHasItems);
	if (firstNonEmptyIndex === -1) return [];

	let lastNonEmptyIndex = phases.length - 1;
	while (lastNonEmptyIndex >= 0 && !phaseHasItems(phases[lastNonEmptyIndex])) {
		lastNonEmptyIndex--;
	}

	return phases.slice(firstNonEmptyIndex, lastNonEmptyIndex + 1);
};

/**
 * Determines which scenario we're in based on phases.
 */
const getScheduleScenario = ({
	scheduledPhases,
	endsWithEmptyPhase,
}: {
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	endsWithEmptyPhase: boolean;
}): ScheduleScenario => {
	if (scheduledPhases.length === 0) return "no_phases";

	if (scheduledPhases.length === 1) {
		if (endsWithEmptyPhase) return "simple_cancel";
		if (!scheduledPhases[0].end_date) return "single_indefinite";
	}

	return "multi_phase";
};

/**
 * Builds the appropriate action for each scenario.
 */
const buildActionForScenario = ({
	scenario,
	hasSchedule,
	scheduleId,
	scheduledPhases,
	cancelAtSeconds,
	endsWithEmptyPhase,
}: {
	scenario: ScheduleScenario;
	hasSchedule: boolean;
	scheduleId: string | undefined;
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	cancelAtSeconds: number | undefined;
	endsWithEmptyPhase: boolean;
}): StripeSubscriptionScheduleResult => {
	switch (scenario) {
		case "no_phases":
			return {};

		case "single_indefinite":
			// Uncancel scenario: release schedule if exists, otherwise nothing
			return hasSchedule
				? {
						scheduleAction: {
							type: "release",
							stripeSubscriptionScheduleId: scheduleId!,
						},
					}
				: {};

		case "simple_cancel":
			// Cancel at end of cycle: use cancel_at on subscription, not schedule
			return {
				scheduleAction: hasSchedule
					? {
							type: "release",
							stripeSubscriptionScheduleId: scheduleId!,
						}
					: undefined,
				subscriptionCancelAt: cancelAtSeconds,
			};

		case "multi_phase": {
			// Multiple transitions: need a schedule
			const endBehavior = endsWithEmptyPhase ? "cancel" : "release";

			return hasSchedule
				? {
						scheduleAction: {
							type: "update",
							stripeSubscriptionScheduleId: scheduleId!,
							params: {
								phases: scheduledPhases,
								end_behavior: endBehavior,
							},
						},
					}
				: {
						scheduleAction: {
							type: "create",
							params: {
								phases: scheduledPhases,
								end_behavior: endBehavior,
							},
						},
					};
		}
	}
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the subscription schedule action based on customer products.
 *
 * Returns:
 * - scheduleAction: The schedule action to execute (create, update, or release)
 * - subscriptionCancelAt: If set, the subscription should be canceled at this timestamp
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

	// 1. Filter to relevant customer products
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

	// 2. Build phases
	const phases = buildStripePhasesUpdate({
		ctx,
		billingContext,
		customerProducts,
		trialEndsAt,
	});

	const scheduledPhases = filterEmptyPhases(phases);

	// 3. Derive cancel info from trailing empty phase
	const lastPhase = phases[phases.length - 1];
	const endsWithEmptyPhase = !!lastPhase && !phaseHasItems(lastPhase);
	const cancelAtSeconds =
		endsWithEmptyPhase && typeof lastPhase.start_date === "number"
			? lastPhase.start_date
			: undefined;

	// 4. Determine scenario and build action
	const scenario = getScheduleScenario({ scheduledPhases, endsWithEmptyPhase });

	return buildActionForScenario({
		scenario,
		hasSchedule: !!stripeSubscriptionSchedule,
		scheduleId: stripeSubscriptionSchedule?.id,
		scheduledPhases,
		cancelAtSeconds,
		endsWithEmptyPhase,
	});
};
