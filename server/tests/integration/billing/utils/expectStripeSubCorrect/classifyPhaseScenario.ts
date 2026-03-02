import type Stripe from "stripe";

export type PhaseScenario =
	| "no_phases"
	| "single_indefinite"
	| "simple_cancel"
	| "multi_phase";

const phaseHasItems = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): boolean => {
	return phase.items !== undefined && phase.items.length > 0;
};

/** Strips empty phases from both ends (mirrors production filterEmptyPhases). */
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
 * Classifies raw phases into one of 4 scenarios.
 * Returns the scenario, non-empty phases, and the expected cancel_at (in seconds) if applicable.
 */
export const classifyPhaseScenario = ({
	rawPhases,
}: {
	rawPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
}): {
	scenario: PhaseScenario;
	scheduledPhases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	cancelAtSeconds?: number;
} => {
	const scheduledPhases = filterEmptyPhases(rawPhases);

	const lastPhase = rawPhases[rawPhases.length - 1];
	const endsWithEmptyPhase = !!lastPhase && !phaseHasItems(lastPhase);
	const cancelAtSeconds =
		endsWithEmptyPhase && typeof lastPhase.start_date === "number"
			? lastPhase.start_date
			: undefined;

	let scenario: PhaseScenario;

	if (scheduledPhases.length === 0) {
		scenario = "no_phases";
	} else if (scheduledPhases.length === 1) {
		if (endsWithEmptyPhase) {
			scenario = "simple_cancel";
		} else if (!scheduledPhases[0].end_date) {
			scenario = "single_indefinite";
		} else {
			scenario = "multi_phase";
		}
	} else {
		scenario = "multi_phase";
	}

	return { scenario, scheduledPhases, cancelAtSeconds };
};
