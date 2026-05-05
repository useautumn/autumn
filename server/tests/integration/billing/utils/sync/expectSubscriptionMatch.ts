import { expect } from "bun:test";
import type {
	PlanBase,
	SubscriptionMatch,
} from "@/internal/billing/v2/actions/sync/detect/types";

export type ExpectedMatchedPlan = {
	plan_id?: string;
	base_kind?: PlanBase["kind"];
};

export type ExpectedPhaseMatch = {
	plans: ExpectedMatchedPlan[];
	is_current?: boolean;
	/** When true, asserts no Stripe items in this phase are unmatched. */
	noUnmatchedItems?: boolean;
};

export type ExpectedCurrentPhase = {
	plans: ExpectedMatchedPlan[];
	/** When set, asserts no Stripe items in the current phase are unmatched. */
	noUnmatchedItems?: boolean;
};

const expectPhaseMatchCorrect = ({
	phase,
	expected,
}: {
	phase: SubscriptionMatch["phaseMatches"][number];
	expected: ExpectedPhaseMatch;
}) => {
	if (expected.is_current !== undefined) {
		expect(phase.is_current).toBe(expected.is_current);
	}

	expect(phase.plans).toHaveLength(expected.plans.length);

	expected.plans.forEach((expectedPlan, planIndex) => {
		const plan = phase.plans[planIndex];
		if (expectedPlan.plan_id !== undefined) {
			expect(plan.product.id).toBe(expectedPlan.plan_id);
		}
		if (expectedPlan.base_kind !== undefined) {
			expect(plan.base.kind).toBe(expectedPlan.base_kind);
		}
	});

	if (expected.noUnmatchedItems) {
		const unmatched = phase.item_diffs.filter((d) => d.match.kind === "none");
		expect(unmatched).toEqual([]);
	}
};

/**
 * Match-side counterpart to `expectSyncParamsCorrect` — asserts on the
 * detection result (`SubscriptionMatch`).
 *
 * Pass `currentPhase` to assert against the current phase only. Pass
 * `phaseMatches` to assert against every phase by index (the order matches
 * `match.phaseMatches`).
 */
export const expectSubscriptionMatchCorrect = ({
	match,
	currentPhase,
	phaseMatches,
}: {
	match: SubscriptionMatch;
	currentPhase?: ExpectedCurrentPhase;
	phaseMatches?: ExpectedPhaseMatch[];
}) => {
	if (currentPhase) {
		const phase = match.phaseMatches.find((p) => p.is_current);
		expect(phase).toBeDefined();
		expectPhaseMatchCorrect({
			phase: phase!,
			expected: {
				plans: currentPhase.plans,
				noUnmatchedItems: currentPhase.noUnmatchedItems,
			},
		});
	}

	if (phaseMatches) {
		expect(match.phaseMatches).toHaveLength(phaseMatches.length);
		phaseMatches.forEach((expected, i) => {
			expectPhaseMatchCorrect({ phase: match.phaseMatches[i], expected });
		});
	}
};
