import type {
	AutumnBillingPlan,
	BillingContext,
	FullCusProduct,
	StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import {
	cp,
	filterCustomerProductsByProcessorType,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	ProcessorType,
	stripePhaseStartsInFuture,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import {
	buildStripePhasesUpdate,
	isFreePhasePlaceholderItem,
} from "@server/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildStripePhasesUpdate";
import type Stripe from "stripe";
import { stripeScheduleMatchesPhases } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/stripeScheduleMatchesPhases";
import { getPatchCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type StripeSubscriptionScheduleResult = {
	scheduleAction?: StripeSubscriptionScheduleAction;
	/** number = set cancel_at, null = clear cancel_at, undefined = don't touch */
	subscriptionCancelAt?: number | null;
	subscriptionStartsAt?: number | "now";
};

/**
 * The 4 possible scenarios for subscription schedule actions:
 * - no_phases: No phases with items, nothing to do
 * - single_indefinite: 1 phase with no end_date (e.g., uncancel)
 * - simple_cancel: 1 phase + trailing empty (cancel at end of cycle)
 * - future_standalone: A standalone schedule that starts in the future
 * - multi_phase: Multiple phases requiring a schedule
 */
type ScheduleScenario =
	| "no_phases"
	| "single_indefinite"
	| "simple_cancel"
	| "future_standalone"
	| "multi_phase";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const phaseHasItems = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): boolean => {
	return phase.items !== undefined && phase.items.length > 0;
};

const isFreePhasePlaceholderOnly = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): boolean =>
	phaseHasItems(phase) && (phase.items ?? []).every(isFreePhasePlaceholderItem);

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
	shouldCreateFutureSchedule,
	hasSubscription,
	isCreateSchedule,
}: {
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	endsWithEmptyPhase: boolean;
	shouldCreateFutureSchedule: boolean;
	hasSubscription: boolean;
	isCreateSchedule: boolean;
}): ScheduleScenario => {
	if (scheduledPhases.length === 0) return "no_phases";
	if (shouldCreateFutureSchedule) return "future_standalone";

	if (scheduledPhases.length === 1) {
		// A lone $0 placeholder has no subscription items to create a subscription from.
		const needsStandaloneSchedule =
			isCreateSchedule &&
			!hasSubscription &&
			isFreePhasePlaceholderOnly(scheduledPhases[0]);
		if (endsWithEmptyPhase && !needsStandaloneSchedule) return "simple_cancel";
		if (!scheduledPhases[0].end_date) return "single_indefinite";
	}

	return "multi_phase";
};

/** An existing schedule is released onto its subscription, or cancelled when it has none. */
const buildEndScheduleAction = ({
	hasSubscription,
	scheduleId,
}: {
	hasSubscription: boolean;
	scheduleId: string | undefined;
}): StripeSubscriptionScheduleResult => {
	if (!scheduleId) return {};

	if (hasSubscription) {
		return {
			scheduleAction: {
				type: "release",
				stripeSubscriptionScheduleId: scheduleId,
			},
			subscriptionCancelAt: null,
		};
	}

	return {
		scheduleAction: {
			type: "cancel",
			stripeSubscriptionScheduleId: scheduleId,
		},
	};
};

/**
 * Builds the appropriate action for each scenario.
 */
const buildActionForScenario = ({
	scenario,
	existingSchedule,
	nowMs,
	hasSchedule,
	hasSubscription,
	scheduleId,
	scheduledPhases,
	cancelAtSeconds,
	endsWithEmptyPhase,
	subscriptionStartsAt,
}: {
	scenario: ScheduleScenario;
	existingSchedule: Stripe.SubscriptionSchedule | undefined;
	nowMs: number;
	hasSchedule: boolean;
	hasSubscription: boolean;
	scheduleId: string | undefined;
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	cancelAtSeconds: number | undefined;
	endsWithEmptyPhase: boolean;
	subscriptionStartsAt?: number | "now";
}): StripeSubscriptionScheduleResult => {
	switch (scenario) {
		case "no_phases":
			return buildEndScheduleAction({
				hasSubscription,
				scheduleId,
			});

		case "single_indefinite":
			// Product continues indefinitely: end schedule if exists, clear any cancel_at
			return {
				subscriptionCancelAt: null,
				...buildEndScheduleAction({ hasSubscription, scheduleId }),
			};

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

		case "future_standalone":
		case "multi_phase": {
			// Multiple transitions: need a schedule
			const endBehavior = endsWithEmptyPhase ? "cancel" : "release";
			const scheduleUnchanged =
				existingSchedule &&
				stripeScheduleMatchesPhases({
					schedule: existingSchedule,
					phases: scheduledPhases,
					endBehavior,
					nowMs,
				});
			if (scheduleUnchanged) return { subscriptionStartsAt };

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
						subscriptionStartsAt,
					}
				: {
						scheduleAction: {
							type: "create",
							params: {
								phases: scheduledPhases,
								end_behavior: endBehavior,
							},
						},
						subscriptionStartsAt,
					};
		}
	}
};

/** A recreate unlinks its rows from the old subscription and schedule before relinking them. */
const isUnlinkedFromStripe = (customerProduct: FullCusProduct) =>
	(customerProduct.subscription_ids ?? []).length === 0 &&
	(customerProduct.scheduled_ids ?? []).length === 0;

const shouldCreateFutureSchedule = ({
	billingContext,
	scheduledPhases,
	stripeSubscription,
}: {
	billingContext: BillingContext;
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	stripeSubscription?: Stripe.Subscription;
}) => {
	if (stripeSubscription) return false;

	return stripePhaseStartsInFuture(
		scheduledPhases[0]?.start_date,
		billingContext.currentEpochMs,
	);
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the subscription schedule action based on customer products.
 *
 * Returns:
 * - scheduleAction: The schedule action to execute (create, update, or release)
 * - subscriptionCancelAt: number = set cancel_at, null = clear cancel_at, undefined = don't touch
 */
export const buildStripeSubscriptionScheduleAction = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	finalCustomerProducts,
	trialEndsAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	finalCustomerProducts: FullCusProduct[];
	trialEndsAt?: number;
}): StripeSubscriptionScheduleResult => {
	const { stripeSubscriptionSchedule, stripeSubscription } = billingContext;
	const insertedCustomerProductIds = new Set(
		autumnBillingPlan.insertCustomerProducts.map(({ id }) => id),
	);
	const patchedCustomerProductIds = new Set(
		getPatchCustomerProducts({ autumnBillingPlan }).map(
			({ customerProduct }) => customerProduct.id,
		),
	);

	// 1. Filter to relevant customer products
	const relatedCustomerProducts = finalCustomerProducts.filter(
		(customerProduct) => {
			if (insertedCustomerProductIds.has(customerProduct.id)) return true;

			if (
				patchedCustomerProductIds.has(customerProduct.id) &&
				isUnlinkedFromStripe(customerProduct)
			) {
				return true;
			}

			if (
				stripeSubscription &&
				isCustomerProductOnStripeSubscription({
					customerProduct,
					stripeSubscriptionId: stripeSubscription.id,
				})
			) {
				return true;
			}

			if (
				stripeSubscriptionSchedule &&
				isCustomerProductOnStripeSubscriptionSchedule({
					customerProduct,
					stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
				})
			) {
				return true;
			}

			return false;
		},
	);

	const customerProducts = filterCustomerProductsByProcessorType({
		customerProducts: relatedCustomerProducts,
		processorType: ProcessorType.Stripe,
	}).filter(
		(customerProduct) =>
			cp(customerProduct).recurring().hasRelevantStatus().valid,
	);

	// 2. Build phases
	// Free-only schedule support is scoped to create_schedule; other actions keep prior behavior.
	const isCreateSchedule = autumnBillingPlan.ownsSchedulePersistence === true;

	const phases = buildStripePhasesUpdate({
		ctx,
		billingContext,
		customerProducts,
		trialEndsAt,
		useFreePhaseStripeProduct: isCreateSchedule,
	});

	const scheduledPhases = filterEmptyPhases(phases);
	const isFutureSchedule = shouldCreateFutureSchedule({
		billingContext,
		scheduledPhases,
		stripeSubscription,
	});

	// 3. Derive cancel info from trailing empty phase
	const lastPhase = phases[phases.length - 1];
	const endsWithEmptyPhase = !!lastPhase && !phaseHasItems(lastPhase);
	const cancelAtSeconds =
		endsWithEmptyPhase && typeof lastPhase.start_date === "number"
			? lastPhase.start_date
			: undefined;

	// 4. Determine scenario and build action
	const scenario = getScheduleScenario({
		scheduledPhases,
		endsWithEmptyPhase,
		shouldCreateFutureSchedule: isFutureSchedule,
		hasSubscription: !!stripeSubscription,
		isCreateSchedule,
	});

	return buildActionForScenario({
		scenario,
		existingSchedule: stripeSubscriptionSchedule ?? undefined,
		nowMs: billingContext.currentEpochMs,
		hasSchedule: !!stripeSubscriptionSchedule,
		hasSubscription: !!stripeSubscription,
		scheduleId: stripeSubscriptionSchedule?.id,
		scheduledPhases,
		cancelAtSeconds,
		endsWithEmptyPhase,
		subscriptionStartsAt: isFutureSchedule
			? scheduledPhases[0]?.start_date
			: undefined,
	});
};
