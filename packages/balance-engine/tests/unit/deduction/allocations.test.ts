/**
 * The allocation gate on shared (customer-level) rows: an entity draws its own share,
 * then credits nobody holds, then its own overage; never another entity's share.
 *
 * Red (before):  shared rows give an entity everything they have.
 * Green (after): shared draws stop at own unused + unallocated, and the counters move.
 */

import { describe, expect, test } from "bun:test";
import {
	ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	EntInterval,
	getUsageWindowBounds,
} from "@autumn/shared";
import type {
	WorkerCustomerEntitlement,
	WorkerUsageWindow,
} from "../../../src/balanceEngine.js";
import { createSubjectState } from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	entity,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import { createDeductionRequest, customerWith } from "./deductionFixtures.js";

const nextResetAt = occurredAt + 10 * 24 * 60 * 60 * 1000;
const cycle = getUsageWindowBounds({
	interval: EntInterval.Month,
	now: occurredAt,
	anchor: nextResetAt,
});
const otherEntity = "ent_internal_b";

const pool = ({ balance }: { balance: number }): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id: "pool", featureId: "credits", balance }),
	next_reset_at: nextResetAt,
});

const ownOverageRow = ({
	usageAllowed,
}: {
	usageAllowed: boolean;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id: "a_overage", featureId: "credits", balance: 0 }),
	customer_product_id: "cp_a",
	internal_entity_id: entity.internal_id,
	usage_allowed: usageAllowed,
});

const counter = ({
	internalEntityId,
	usage,
	windowStartAt = cycle.windowStartAt,
	windowEndAt = cycle.windowEndAt,
}: {
	internalEntityId: string | null;
	usage: number;
	windowStartAt?: number;
	windowEndAt?: number;
}): WorkerUsageWindow => ({
	id: `uw_${internalEntityId ?? "total"}`,
	internal_customer_id: "cus_1",
	internal_entity_id: internalEntityId,
	feature_id: "credits",
	internal_feature_id: "feat_credits",
	filter_key: ALLOCATION_USAGE_WINDOW_FILTER_KEY,
	anchor_customer_entitlement_id: "pool",
	window_start_at: windowStartAt,
	window_end_at: windowEndAt,
	usage,
	updated_at: occurredAt - 1,
});

const trackAsEntity = ({
	amounts,
	poolBalance = 10000,
	usageAllowed = true,
	usageWindows = [],
	scale = 1,
	scaleCycleEnd = null,
	value,
}: {
	amounts: Record<string, number>;
	poolBalance?: number;
	usageAllowed?: boolean;
	usageWindows?: WorkerUsageWindow[];
	scale?: number;
	scaleCycleEnd?: number | null;
	value: number;
}) =>
	deduct({
		fullSubject: createSubjectFor({
			entityId: entity.id,
			state: createSubjectState({
				identity: { ...identity, entityId: entity.id },
				entity,
				customer: {
					...customerWith({}),
					balance_allocations: {
						feat_credits: {
							feature_id: "credits",
							interval: EntInterval.Month,
							scale,
							scale_cycle_end: scaleCycleEnd,
							amounts,
						},
					},
				},
				customerProducts: [
					createCustomerProduct(),
					createCustomerProduct({ id: "cp_a", internalEntityId: entity.internal_id }),
				],
				customerEntitlements: [
					pool({ balance: poolBalance }),
					ownOverageRow({ usageAllowed }),
				],
				usageWindows,
			}),
		}),
		request: createDeductionRequest({
			org,
			featureId: "credits",
			value,
			overageBehavior: "cap",
		}),
	});

const drawnFrom = (outcome: ReturnType<typeof deduct>, id: string) =>
	outcome.deltas
		.filter((delta) => delta.id === id)
		.reduce((sum, delta) => sum - delta.valueDelta, 0);

const counterUsageAdded = (
	outcome: ReturnType<typeof deduct>,
	internalEntityId: string | null,
) =>
	outcome.changes.reduce((sum, change) => {
		if (change.table !== "usageWindows") return sum;
		if (change.op === "increment")
			return change.id === `uw_${internalEntityId ?? "total"}`
				? sum + Number(change.add.usage ?? 0)
				: sum;
		if (change.op !== "insert") return sum;
		const { row } = change;
		return row.internal_entity_id === internalEntityId &&
			row.filter_key === ALLOCATION_USAGE_WINDOW_FILTER_KEY
			? sum + row.usage
			: sum;
	}, 0);

describe("allocation gate", () => {
	test.concurrent(
		"Kyle's scenario with overage on: A's 5k share, then 3k to A's own overage",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				value: 8000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(5000);
			expect(drawnFrom(outcome, "a_overage")).toBe(3000);
			expect(outcome.appliedValue).toBe(8000);
		},
	);

	test.concurrent(
		"Kyle's scenario with overage off: A is blocked at its 5k share",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
				value: 8000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(5000);
			expect(outcome).toMatchObject({ appliedValue: 5000, remaining: 3000 });
		},
	);

	test.concurrent(
		"after its share, A draws credits nobody holds; counters record shared and claimed usage",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000 },
				usageAllowed: false,
				value: 8000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(8000);
			expect(counterUsageAdded(outcome, entity.internal_id)).toBe(8000);
			expect(counterUsageAdded(outcome, null)).toBe(5000);
		},
	);

	test.concurrent(
		"an entity without a share can't touch other entities' shares",
		() => {
			const outcome = trackAsEntity({
				amounts: { ent_internal_x: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
				value: 100,
			});
			expect(drawnFrom(outcome, "pool")).toBe(0);
			expect(outcome.remaining).toBe(100);
		},
	);

	test.concurrent(
		"usage already counted against the share leaves only the rest",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				poolBalance: 6000,
				usageAllowed: false,
				usageWindows: [
					counter({ internalEntityId: entity.internal_id, usage: 4000 }),
					counter({ internalEntityId: null, usage: 4000 }),
				],
				value: 3000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(1000);
		},
	);

	test.concurrent(
		"after a reset, last cycle's counters no longer count against the share",
		() => {
			const lastCycle = {
				windowStartAt: cycle.windowStartAt - 31 * 24 * 60 * 60 * 1000,
				windowEndAt: cycle.windowStartAt,
			};
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
				usageWindows: [
					counter({ internalEntityId: entity.internal_id, usage: 5000, ...lastCycle }),
				],
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(5000);
		},
	);

	test.concurrent(
		"a scale solved for last cycle reads as 1 after a reset",
		() => {
			const stale = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: cycle.windowStartAt,
				value: 5000,
			});
			expect(drawnFrom(stale, "pool")).toBe(5000);

			const current = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: cycle.windowEndAt,
				value: 5000,
			});
			expect(drawnFrom(current, "pool")).toBe(2500);
		},
	);
});
