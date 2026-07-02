import { expect, test } from "bun:test";
import type { MigrationFilter, Operations } from "@autumn/shared";
import { hasActiveFilter } from "./FilterStep";
import { toOperationsPayload } from "./useMigrationEditorForm";

// `hasActiveFilter` gates the customer preview. It must recognize the
// customer-level `$and`/`$or` shapes — not just the legacy single `plan` — or
// multi-condition filters silently render no preview.
test("hasActiveFilter is false for an empty or default-only filter", () => {
	expect(hasActiveFilter({})).toBe(false);
	expect(hasActiveFilter({ plan: { plan_id: "" } })).toBe(false);
});

test("hasActiveFilter is true for a single plan / customer_id condition", () => {
	expect(hasActiveFilter({ plan: { plan_id: "free" } })).toBe(true);
	expect(hasActiveFilter({ customer_id: "cus_1" })).toBe(true);
});

test("hasActiveFilter is true for $and / $or compositions", () => {
	expect(
		hasActiveFilter({
			$and: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
		}),
	).toBe(true);
	expect(
		hasActiveFilter({
			$or: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
		}),
	).toBe(true);
});

// A filter-only draft (no operations yet) must persist: an empty operations
// block is sent as null, since the `{}` shape fails the server's resource-block
// check. A non-empty (even mid-edit) block is kept so editing isn't lost.
const op = {
	type: "add_plan",
	plan_filter: { plan_id: "pro" },
	plan_id: "pro",
} as unknown as NonNullable<Operations["customer"]>[number];

test("toOperationsPayload sends an empty operations block as null", () => {
	expect(toOperationsPayload({ operations: {} })).toBeNull();
	expect(toOperationsPayload({ operations: { customer: [] } })).toBeNull();
});

test("toOperationsPayload keeps a non-empty operations block", () => {
	const operations: Operations = { customer: [op] };
	expect(toOperationsPayload({ operations })).toBe(operations);
});

test("toOperationsPayload inherits the customer plan filter into update operations", () => {
	const filter: MigrationFilter = {
		customer: {
			plan: {
				plan_id: "dedicated",
				custom: false,
				paid: true,
				price: { $ne: null },
			},
		},
	};
	const operations: Operations = {
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: "dedicated" },
				version: 4,
			},
		],
	};
	expect(toOperationsPayload({ operations, filter })).toEqual({
		customer: [
			{
				type: "update_plan",
				plan_filter: {
					plan_id: "dedicated",
					custom: false,
					paid: true,
					price: { $ne: null },
				},
				version: 4,
			},
		],
	});
});

test("operation plan choices override inherited plan id but keep plan properties", () => {
	const filter: MigrationFilter = {
		customer: { plan: { plan_id: "dedicated", custom: false } },
	};
	const operations: Operations = {
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: "enterprise" },
				version: 4,
			},
		],
	};
	expect(toOperationsPayload({ operations, filter })).toEqual({
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: "enterprise", custom: false },
				version: 4,
			},
		],
	});
});

test("filter plan properties overwrite stale operation plan properties", () => {
	const filter: MigrationFilter = {
		customer: { plan: { plan_id: "free", custom: true } },
	};
	const operations: Operations = {
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: "free", custom: false },
				version: 4,
			},
		],
	};
	expect(toOperationsPayload({ operations, filter })).toEqual({
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: "free", custom: true },
				version: 4,
			},
		],
	});
});

test("undefined operation fields do not erase inherited plan filters", () => {
	const filter: MigrationFilter = {
		customer: { plan: { plan_id: "dedicated", custom: false } },
	};
	const operations: Operations = {
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: undefined },
				version: 4,
			},
		],
	};
	expect(toOperationsPayload({ operations, filter })).toEqual({
		customer: [
			{
				type: "update_plan",
				plan_filter: { plan_id: "dedicated", custom: false },
				version: 4,
			},
		],
	});
});
