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
	FeatureType,
	getUsageWindowBounds,
} from "@autumn/shared";
import type {
	WorkerCustomerEntitlement,
	WorkerUsageWindow,
} from "../../../src/balanceEngine.js";
import {
	checkAfterDeduction,
	computeTrackDecision,
	createSubjectState,
	subjectStateToFullSubject,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import { toBalanceEditRequest } from "../../../src/deduction/toBalanceEditRequest.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	createTrackCommand,
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

const pool = ({
	balance,
	usageAllowed = false,
}: {
	balance: number;
	usageAllowed?: boolean;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id: "pool", featureId: "credits", balance }),
	next_reset_at: nextResetAt,
	usage_allowed: usageAllowed,
});

const ownOverageRow = ({
	usageAllowed,
}: {
	usageAllowed: boolean;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({
		id: "a_overage",
		featureId: "credits",
		balance: 0,
	}),
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
	parentId = "pool",
	includeOwnRow = true,
	poolUsageAllowed = false,
	overageBehavior = "cap",
	value,
}: {
	amounts: Record<string, number>;
	poolBalance?: number;
	usageAllowed?: boolean;
	usageWindows?: WorkerUsageWindow[];
	scale?: number;
	scaleCycleEnd?: number | null;
	parentId?: string;
	includeOwnRow?: boolean;
	poolUsageAllowed?: boolean;
	overageBehavior?: "cap" | "reject" | "overflow";
	value: number;
}) =>
	deduct({
		fullSubject: allocatedSubject({
			amounts,
			poolBalance,
			usageAllowed,
			usageWindows,
			scale,
			scaleCycleEnd,
			parentId,
			includeOwnRow,
			poolUsageAllowed,
		}),
		request: createDeductionRequest({
			org,
			featureId: "credits",
			value,
			overageBehavior,
		}),
	});

const allocatedSubject = ({
	amounts,
	poolBalance = 10000,
	usageAllowed = true,
	usageWindows = [],
	scale = 1,
	scaleCycleEnd = null,
	parentId = "pool",
	includeOwnRow = true,
	poolUsageAllowed = false,
}: {
	amounts: Record<string, number>;
	poolBalance?: number;
	usageAllowed?: boolean;
	usageWindows?: WorkerUsageWindow[];
	scale?: number;
	scaleCycleEnd?: number | null;
	parentId?: string;
	includeOwnRow?: boolean;
	poolUsageAllowed?: boolean;
}) =>
	createSubjectFor({
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
						parent_customer_entitlement_id: parentId,
						amounts,
					},
				},
			},
			customerProducts: [
				createCustomerProduct(),
				createCustomerProduct({
					id: "cp_a",
					internalEntityId: entity.internal_id,
				}),
			],
			customerEntitlements: [
				pool({ balance: poolBalance, usageAllowed: poolUsageAllowed }),
				...(includeOwnRow ? [ownOverageRow({ usageAllowed })] : []),
			],
			usageWindows,
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
			expect(outcome).toMatchObject({ appliedValue: 0, remaining: 100 });
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
		"a counter left by another feature under the same public id doesn't count against the share",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
				usageWindows: [
					{
						...counter({ internalEntityId: entity.internal_id, usage: 5000 }),
						internal_feature_id: "feat_credits_old",
					},
				],
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(5000);
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
					counter({
						internalEntityId: entity.internal_id,
						usage: 5000,
						...lastCycle,
					}),
				],
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(5000);
		},
	);

	test.concurrent(
		"a scale solved for last cycle is re-solved from the pot at the reset: 10k requested on a 6k pot grants 3000 each",
		() => {
			const stale = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				poolBalance: 6000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: cycle.windowStartAt,
				value: 5000,
			});
			expect(drawnFrom(stale, "pool")).toBe(3000);
			expect(stale.remaining).toBe(2000);

			const current = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				poolBalance: 6000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: cycle.windowEndAt,
				value: 5000,
			});
			expect(drawnFrom(current, "pool")).toBe(2500);
		},
	);

	test.concurrent(
		"a refund gives back to the entity's own share first (PRD §8.3 step 5)",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 500, [otherEntity]: 500 },
				poolBalance: 600,
				includeOwnRow: false,
				usageWindows: [
					counter({ internalEntityId: entity.internal_id, usage: 400 }),
					counter({ internalEntityId: null, usage: 400 }),
				],
				value: -200,
			});
			expect(drawnFrom(outcome, "pool")).toBe(-200);
			expect(counterUsageAdded(outcome, entity.internal_id)).toBe(-200);
			expect(counterUsageAdded(outcome, null)).toBe(-200);
		},
	);

	test.concurrent(
		"a refund of usage beyond the share only frees claimed credits up to the share",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 500 },
				poolBalance: 400,
				includeOwnRow: false,
				usageWindows: [
					counter({ internalEntityId: entity.internal_id, usage: 600 }),
					counter({ internalEntityId: null, usage: 500 }),
				],
				value: -200,
			});
			expect(counterUsageAdded(outcome, entity.internal_id)).toBe(-200);
			expect(counterUsageAdded(outcome, null)).toBe(-100);
		},
	);

	test.concurrent(
		"a shared row that allows overage still can't give another entity's share",
		() => {
			const outcome = trackAsEntity({
				amounts: { ent_internal_x: 500, [otherEntity]: 500 },
				poolBalance: 1000,
				poolUsageAllowed: true,
				includeOwnRow: false,
				value: 600,
			});
			expect(drawnFrom(outcome, "pool")).toBe(0);
			expect(outcome).toMatchObject({ appliedValue: 0, remaining: 600 });
		},
	);

	test.concurrent(
		"overage below zero on a shared row is allowed once the entity's headroom covers what's left",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 500 },
				poolBalance: 500,
				poolUsageAllowed: true,
				includeOwnRow: false,
				value: 800,
			});
			expect(drawnFrom(outcome, "pool")).toBe(800);
			expect(counterUsageAdded(outcome, entity.internal_id)).toBe(500);
		},
	);

	test.concurrent("overflow doesn't skip the allocation gate", () => {
		const outcome = trackAsEntity({
			amounts: { ent_internal_x: 500, [otherEntity]: 500 },
			poolBalance: 1000,
			includeOwnRow: false,
			overageBehavior: "overflow",
			value: 600,
		});
		expect(drawnFrom(outcome, "pool")).toBe(0);
		expect(outcome).toMatchObject({ appliedValue: 0, remaining: 600 });
	});

	test.concurrent(
		"a scale solved against a pinned parent that's gone is re-solved from the pot",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				poolBalance: 6000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: cycle.windowEndAt,
				parentId: "removed_pool",
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(3000);
		},
	);

	test.concurrent(
		"a scale with no cycle end is re-solved from the pot, not held forever",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				poolBalance: 6000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: null,
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(3000);
		},
	);

	test.concurrent(
		"a stale re-solve uses the pot as it stood at cycle start: after A draws 3000, B still gets 3000",
		() => {
			const outcome = trackAsEntity({
				amounts: { [otherEntity]: 5000, [entity.internal_id]: 5000 },
				poolBalance: 3000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: null,
				usageWindows: [
					counter({ internalEntityId: otherEntity, usage: 3000 }),
					counter({ internalEntityId: null, usage: 3000 }),
				],
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(3000);
		},
	);

	test.concurrent(
		"a stale scale reads as 1 when the pot covers every request at the reset",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				poolBalance: 10000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: cycle.windowStartAt,
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(5000);
		},
	);

	test.concurrent(
		"a stale re-solved share still floors to whole credits",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 4000 },
				poolBalance: 6000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: null,
				value: 5000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(3333);
		},
	);

	test.concurrent(
		"a cut scale stops binding once the pot covers every unused promise again",
		() => {
			const outcome = trackAsEntity({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				poolBalance: 10000,
				usageAllowed: false,
				scale: 0.5,
				scaleCycleEnd: cycle.windowEndAt,
				value: 6000,
			});
			expect(drawnFrom(outcome, "pool")).toBe(5000);
			expect(outcome.remaining).toBe(1000);
		},
	);

	const adminEdit = ({
		value,
		countsUsageWindows,
	}: {
		value: number;
		countsUsageWindows: boolean;
	}) =>
		deduct({
			fullSubject: allocatedSubject({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
				includeOwnRow: false,
			}),
			request: toBalanceEditRequest({
				featureId: "credits",
				internalFeatureId: "feat_credits",
				value,
				includesCreditSystems: false,
				countsUsageWindows,
				org,
				now: occurredAt,
			}),
		});

	test.concurrent(
		"a rebuild redraws past the share and leaves the allocation counters alone",
		() => {
			const outcome = adminEdit({ value: 8000, countsUsageWindows: false });
			expect(drawnFrom(outcome, "pool")).toBe(8000);
			expect(counterUsageAdded(outcome, entity.internal_id)).toBe(0);
			expect(counterUsageAdded(outcome, null)).toBe(0);
		},
	);

	test.concurrent(
		"an admin balance edit is neither capped by nor counted against the share",
		() => {
			const outcome = adminEdit({ value: 8000, countsUsageWindows: true });
			expect(drawnFrom(outcome, "pool")).toBe(8000);
			expect(counterUsageAdded(outcome, entity.internal_id)).toBe(0);
			expect(counterUsageAdded(outcome, null)).toBe(0);
		},
	);

	test.concurrent(
		"a check right after a draw sees the share that draw used",
		() => {
			const fullSubject = allocatedSubject({
				amounts: { [entity.internal_id]: 5000, [otherEntity]: 5000 },
				usageAllowed: false,
			});
			const command = createCheckCommand({
				entityId: entity.id,
				featureId: "credits",
				requiredBalance: 2500,
			});
			const { outcome } = computeTrackDecision({
				fullSubject,
				command: createTrackCommand({
					featureId: "credits",
					entityId: entity.id,
					value: 3000,
					overageBehavior: "cap",
				}),
			});
			expect(outcome.appliedValue).toBe(3000);
			const check = checkAfterDeduction({ fullSubject, command, outcome });
			expect(check.after.allowed).toBe(false);
			expect(check.before().allowed).toBe(true);
		},
	);
});

describe("allocation gates across features", () => {
	const messagesPool = ({ balance }: { balance: number }) => ({
		...createCustomerEntitlement({
			id: "messages_pool",
			featureId: "messages",
			balance,
		}),
		next_reset_at: nextResetAt,
	});
	const subject = () => {
		const state = createSubjectState({
			identity: { ...identity, entityId: entity.id },
			entity,
			customer: {
				...customerWith({}),
				balance_allocations: {
					feat_messages: {
						feature_id: "messages",
						interval: EntInterval.Month,
						scale: 1,
						amounts: { [entity.internal_id]: 100, [otherEntity]: 900 },
					},
					feat_credits: {
						feature_id: "credits",
						interval: EntInterval.Month,
						scale: 1,
						amounts: { [entity.internal_id]: 50, [otherEntity]: 950 },
					},
				},
			},
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [
				messagesPool({ balance: 1000 }),
				pool({ balance: 1000 }),
			],
		});
		const catalog = createCatalogFor({ state });
		const credits = catalog.features.feat_credits;
		if (!credits) throw new Error("credits feature row missing");
		credits.type = FeatureType.CreditSystem;
		credits.config = {
			schema: [
				{ metered_feature_id: "messages", feature_amount: 1, credit_amount: 2 },
			],
		};
		return subjectStateToFullSubject({
			state,
			catalog,
			entityId: entity.id,
		});
	};

	test.concurrent(
		"a metered pool and the credit system funding it each hold the entity to its own share",
		() => {
			const outcome = deduct({
				fullSubject: subject(),
				request: createDeductionRequest({
					org,
					featureId: "messages",
					value: 500,
				}),
			});
			expect(drawnFrom(outcome, "messages_pool")).toBe(100);
			expect(drawnFrom(outcome, "pool")).toBe(25);
			expect(outcome).toMatchObject({ appliedValue: 125, remaining: 375 });
			const allocationCounters = outcome.changes.flatMap((change) =>
				change.table === "usageWindows" && change.op === "insert"
					? [
							[
								change.row.internal_feature_id,
								change.row.internal_entity_id,
								change.row.usage,
							],
						]
					: [],
			);
			expect(allocationCounters).toEqual(
				expect.arrayContaining([
					["feat_messages", entity.internal_id, 100],
					["feat_messages", null, 100],
					["feat_credits", entity.internal_id, 50],
					["feat_credits", null, 50],
				]),
			);
		},
	);
});
