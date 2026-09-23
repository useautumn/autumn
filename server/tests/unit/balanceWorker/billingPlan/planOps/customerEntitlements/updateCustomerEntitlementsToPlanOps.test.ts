import { describe, expect, test } from "bun:test";
import type { BillingPlanOp } from "@autumn/balance-engine";
import type { UpdateCustomerEntitlement } from "@autumn/shared";
import { updateCustomerEntitlementsToPlanOps } from "@/internal/balanceWorker/billingPlan/planOps/customerEntitlements/updateCustomerEntitlementsToPlanOps.js";
import { grant, planOf } from "../../billingPlanFixtures.js";

const target = grant({ id: "grant_target", customerProductId: "cp_1" });

const opsFor = (
	updates: Omit<UpdateCustomerEntitlement, "customerEntitlement">[],
) =>
	updateCustomerEntitlementsToPlanOps({
		autumnBillingPlan: planOf({
			updateCustomerEntitlements: updates.map((update) => ({
				customerEntitlement: target,
				...update,
			})),
		}),
	});

const increment = (balance: number): BillingPlanOp => ({
	op: "increment",
	table: "customerEntitlements",
	id: "grant_target",
	add: { balance },
});

describe("updateCustomerEntitlementsToPlanOps", () => {
	test("a plan that updates no grant changes nothing", () => {
		expect(
			updateCustomerEntitlementsToPlanOps({ autumnBillingPlan: planOf({}) }),
		).toEqual([]);
	});

	test("field updates replace columns, and a balance change beside them is ignored as the legacy lane ignores it", () => {
		expect(
			opsFor([
				{
					updates: { next_reset_at: 1_800_000_000_000, adjustment: 4 },
					balanceChange: 9,
				},
			]),
		).toEqual([
			{
				op: "update",
				table: "customerEntitlements",
				id: "grant_target",
				set: { next_reset_at: 1_800_000_000_000, adjustment: 4 },
			},
		]);
	});

	test("updates that set no column change nothing, and still swallow the balance change", () => {
		expect(opsFor([{ updates: {}, balanceChange: 5 }])).toEqual([]);
		expect(
			opsFor([
				{
					updates: { next_reset_at: undefined, balance: undefined },
					balanceChange: 5,
				},
			]),
		).toEqual([]);
	});

	test("with no updates, a zero or absent balance change moves nothing", () => {
		expect(opsFor([{ balanceChange: 0 }])).toEqual([]);
		expect(opsFor([{}])).toEqual([]);
	});

	test("with no updates, a balance change is a delta on the grant", () => {
		expect(opsFor([{ balanceChange: -3 }])).toEqual([increment(-3)]);
		expect(opsFor([{ balanceChange: 7 }])).toEqual([increment(7)]);
	});

	test("replaceable changes alone are not the worker's", () => {
		expect(
			opsFor([{ insertReplaceables: [], deletedReplaceables: [] }]),
		).toEqual([]);
	});

	test("entity balances and a cleared anchor pass through as set", () => {
		const entities = { ent_1: { id: "ent_1", balance: 3, adjustment: 0 } };
		expect(
			opsFor([{ updates: { entities, reset_cycle_anchor: null } }]),
		).toEqual([
			{
				op: "update",
				table: "customerEntitlements",
				id: "grant_target",
				set: { entities, reset_cycle_anchor: null },
			},
		]);
	});

	test("per-entity balance changes ride on the increment as entry deltas", () => {
		expect(
			opsFor([
				{ balanceChange: -2, entityBalanceChanges: { u1: 500, u2: 500 } },
			]),
		).toEqual([
			{
				op: "increment",
				table: "customerEntitlements",
				id: "grant_target",
				add: { balance: -2 },
				addEntries: {
					entities: { u1: { balance: 500 }, u2: { balance: 500 } },
				},
			},
		]);
		expect(opsFor([{ entityBalanceChanges: { u1: 500 } }])).toEqual([
			{
				op: "increment",
				table: "customerEntitlements",
				id: "grant_target",
				add: {},
				addEntries: { entities: { u1: { balance: 500 } } },
			},
		]);
		expect(opsFor([{ entityBalanceChanges: {} }])).toEqual([]);
	});

	test("moves re-key entries before the deltas land, and alone move nothing else", () => {
		expect(
			opsFor([
				{
					balanceChange: 1,
					moveEntityBalances: { rep_1: "u1" },
					entityBalanceChanges: { u2: 500 },
				},
			]),
		).toEqual([
			{
				op: "moveEntries",
				table: "customerEntitlements",
				id: "grant_target",
				moves: { rep_1: "u1" },
			},
			{
				op: "increment",
				table: "customerEntitlements",
				id: "grant_target",
				add: { balance: 1 },
				addEntries: { entities: { u2: { balance: 500 } } },
			},
		]);
		expect(opsFor([{ moveEntityBalances: { rep_1: "u1" } }])).toEqual([
			{
				op: "moveEntries",
				table: "customerEntitlements",
				id: "grant_target",
				moves: { rep_1: "u1" },
			},
		]);
	});

	test("each update is converted in order", () => {
		expect(
			opsFor([
				{ balanceChange: 2 },
				{ updates: { balance: 50 } },
				{ balanceChange: -1 },
			]),
		).toEqual([
			increment(2),
			{
				op: "update",
				table: "customerEntitlements",
				id: "grant_target",
				set: { balance: 50 },
			},
			increment(-1),
		]);
	});
});
