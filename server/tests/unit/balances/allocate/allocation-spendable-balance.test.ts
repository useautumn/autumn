import { describe, expect, test } from "bun:test";
import {
	type AllocationView,
	type ApiBalanceBreakdownV1,
	type BalanceAllocations,
	type CustomerEntitlementWithPricesView,
	EntInterval,
} from "@autumn/shared";
import { applyAllocationsToBreakdown } from "@autumn/shared/api/customers/cusFeatures/utils/allocations/applyAllocationsToBreakdown.js";

const NOW = Date.UTC(2026, 9, 5);
const feature = { id: "credits", internal_id: "fe_credits" };
const sharedRow = {
	id: "ce_pool",
	next_reset_at: Date.UTC(2026, 10, 2),
	internal_entity_id: null,
	customer_product: { internal_entity_id: null },
	entitlement: { interval: EntInterval.Month },
} as unknown as CustomerEntitlementWithPricesView;

const breakdownRow = ({ remaining }: { remaining: number }) =>
	({
		object: "balance_breakdown",
		id: "ce_pool",
		plan_id: "pro",
		included_grant: 45_000,
		prepaid_grant: 0,
		remaining,
		usage: 45_000 - remaining,
		unlimited: false,
		reset: null,
		price: null,
		expires_at: null,
		overage: 0,
	}) as ApiBalanceBreakdownV1;

const allocations = ({
	amounts,
}: {
	amounts: Record<string, number>;
}): BalanceAllocations => ({
	[feature.internal_id]: {
		feature_id: feature.id,
		interval: EntInterval.Month,
		scale: 1,
		scale_cycle_end: null,
		parent_customer_entitlement_id: sharedRow.id,
		amounts,
	},
});

const render = ({
	entityId,
	view,
	remaining = 45_000,
	balanceAllocations = allocations({
		amounts: { ent_api: 10_000, ent_sdk: 6_000 },
	}),
}: {
	entityId?: string;
	view?: AllocationView;
	remaining?: number;
	balanceAllocations?: BalanceAllocations | null;
}) => {
	const result = applyAllocationsToBreakdown({
		subject: {
			customer: { balance_allocations: balanceAllocations },
			entity: entityId ? { internal_id: entityId } : null,
			usage_windows: [],
		},
		feature,
		customerEntitlements: [sharedRow],
		breakdownItems: [breakdownRow({ remaining })],
		view,
		now: NOW,
	});
	const [row] = result.breakdownItems;
	return {
		...result,
		row,
		spendable: row.remaining + (result.checkRemainingOffset ?? 0),
	};
};

describe("allocated balances render what each caller may spend", () => {
	test("customers.get keeps the whole pool with the allocated split", () => {
		const { row, totals, spendable } = render({});
		expect(row.remaining).toBe(45_000);
		expect(totals).toEqual({ allocated: 16_000, unallocated: 29_000 });
		expect(spendable).toBe(29_000);
	});

	test("customer-level check shows only unallocated credits", () => {
		const { row, totals, checkRemainingOffset } = render({
			view: "spendable",
		});
		expect(row).toMatchObject({ included_grant: 29_000, remaining: 29_000 });
		expect(totals).toEqual({ allocated: 16_000, unallocated: 29_000 });
		expect(checkRemainingOffset).toBe(0);
	});

	test.each([
		["ent_sdk", 6_000, 35_000],
		["ent_api", 10_000, 39_000],
	])(
		"allocated entity %s shows its share plus unallocated",
		(entityId, share, total) => {
			for (const view of ["pool", "spendable"] as const) {
				const { row, totals, checkRemainingOffset } = render({
					entityId,
					view,
				});
				expect(row).toMatchObject({
					included_grant: total,
					remaining: total,
					allocation: { amount: share },
				});
				expect(totals).toEqual({ allocated: share, unallocated: 29_000 });
				expect(checkRemainingOffset).toBe(0);
			}
		},
	);

	test("entity without an allocation shows only unallocated credits", () => {
		const { row, totals, checkRemainingOffset } = render({
			entityId: "ent_guides",
		});
		expect(row).toMatchObject({
			included_grant: 29_000,
			remaining: 29_000,
			allocation: null,
		});
		expect(totals).toEqual({ allocated: 0, unallocated: 29_000 });
		expect(checkRemainingOffset).toBe(0);
	});

	test("an over-allocated pool shows an entity only its scaled share", () => {
		const { row, totals } = render({ entityId: "ent_sdk", remaining: 10_000 });
		expect(row.remaining).toBe(3_750);
		expect(totals).toEqual({ allocated: 3_750, unallocated: 0 });
		expect(render({ remaining: 10_000, view: "spendable" }).row.remaining).toBe(
			0,
		);
	});

	test("spendable credits match the engine's gate in every view", () => {
		const cases = [
			{ entityId: undefined, expected: 29_000 },
			{ entityId: "ent_sdk", expected: 35_000 },
			{ entityId: "ent_api", expected: 39_000 },
			{ entityId: "ent_guides", expected: 29_000 },
		];
		for (const { entityId, expected } of cases)
			for (const view of ["pool", "spendable"] as const)
				expect(render({ entityId, view }).spendable).toBe(expected);
	});

	test("no allocations renders identically in every view", () => {
		const pool = render({ balanceAllocations: null, view: "pool" });
		const spendable = render({ balanceAllocations: null, view: "spendable" });
		expect(spendable).toEqual(pool);
		expect(pool.row.remaining).toBe(45_000);
		expect(pool.checkRemainingOffset).toBeNull();
	});
});
