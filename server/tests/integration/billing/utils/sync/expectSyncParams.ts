import { expect } from "bun:test";
import type { SyncParamsV1 } from "@autumn/shared";

export type ExpectedPlan = {
	plan_id: string;
	quantity?: number;
	internal_entity_id?: string;
	expire_previous?: boolean;
	customize?:
		| null
		| {
				price?:
					| null
					| {
							amount?: number;
							interval?: string;
							interval_count?: number;
							stripe_price_id?: string;
					  };
		  };
	feature_quantities?: {
		feature_id: string;
		quantity?: number;
		stripe_price_id?: string;
	}[];
};

export type ExpectedPhase = {
	/** Skip the assertion when undefined (useful for future-dated phases where the timestamp is dynamic). */
	starts_at?: number | "now";
	plans: ExpectedPlan[];
};

const expectPlanCorrect = ({
	plan,
	expected,
}: {
	plan: NonNullable<SyncParamsV1["phases"]>[number]["plans"][number];
	expected: ExpectedPlan;
}) => {
	expect(plan.plan_id).toBe(expected.plan_id);

	if (expected.quantity !== undefined) {
		expect(plan.quantity ?? 1).toBe(expected.quantity);
	}
	if (expected.internal_entity_id !== undefined) {
		expect(plan.internal_entity_id).toBe(expected.internal_entity_id);
	}
	if (expected.expire_previous !== undefined) {
		expect(plan.expire_previous).toBe(expected.expire_previous);
	}

	if (expected.customize === undefined) {
		// not asserted
	} else if (expected.customize === null) {
		expect(plan.customize).toBeUndefined();
	} else {
		expect(plan.customize).toBeDefined();
		if (expected.customize.price === null) {
			expect(plan.customize?.price).toBeNull();
		} else if (expected.customize.price !== undefined) {
			expect(plan.customize?.price).toMatchObject(expected.customize.price);
		}
	}

	if (expected.feature_quantities !== undefined) {
		expect(plan.feature_quantities).toBeDefined();
		for (const expectedFq of expected.feature_quantities) {
			const actual = plan.feature_quantities?.find(
				(fq) => fq.feature_id === expectedFq.feature_id,
			);
			expect(actual).toBeDefined();
			if (expectedFq.quantity !== undefined) {
				expect(actual?.quantity ?? 0).toBe(expectedFq.quantity);
			}
			if (expectedFq.stripe_price_id !== undefined) {
				expect(actual?.stripe_price_id).toBe(expectedFq.stripe_price_id);
			}
		}
	}
};

/**
 * Verify a `SyncParamsV1` matches expected identity + phases + plans shape.
 *
 * Each `expected.phases[i]` asserts `starts_at` and per-plan fields. Fields
 * that are `undefined` on the expected object are skipped. Pass
 * `customize: null` to assert no customize was set.
 */
export const expectSyncParamsCorrect = ({
	params,
	customer_id,
	stripe_subscription_id,
	stripe_schedule_id,
	phases,
}: {
	params: SyncParamsV1;
	customer_id: string;
	stripe_subscription_id?: string;
	stripe_schedule_id?: string;
	phases: ExpectedPhase[];
}) => {
	expect(params.customer_id).toBe(customer_id);

	if (stripe_subscription_id !== undefined) {
		expect(params.stripe_subscription_id).toBe(stripe_subscription_id);
	}
	if (stripe_schedule_id !== undefined) {
		expect(params.stripe_schedule_id).toBe(stripe_schedule_id);
	}

	expect(params.phases).toBeDefined();
	expect(params.phases).toHaveLength(phases.length);

	phases.forEach((expectedPhase, phaseIndex) => {
		const phase = params.phases![phaseIndex];
		if (expectedPhase.starts_at !== undefined) {
			expect(phase.starts_at).toBe(expectedPhase.starts_at);
		}
		expect(phase.plans).toHaveLength(expectedPhase.plans.length);
		expectedPhase.plans.forEach((expectedPlan, planIndex) => {
			expectPlanCorrect({
				plan: phase.plans[planIndex],
				expected: expectedPlan,
			});
		});
	});
};
