import { expect, test } from "bun:test";
import type { MigrationFilter } from "@autumn/shared";
import { buildGroups, groupsToMigrationFilter } from "./FilterForm";
import type { FilterGroupData, FilterRule } from "./filterRowTypes";

const group = (...rules: FilterRule[]): FilterGroupData[] => [{ rules }];
const planOf = (filter: MigrationFilter) => filter.customer?.plan;

// "Plan is not free" must mean "customer has no free plan" ($none), not
// "customer has some non-free plan" ($some ... <> free) — otherwise a
// Free+Pro customer leaks through via the Pro plan.
test("plan_id is_not compiles to a $none quantifier", () => {
	const filter = groupsToMigrationFilter(
		group({ field: "plan_id", operator: "is_not", values: ["free"] }),
		{},
	);
	expect(planOf(filter)).toEqual({ $none: { plan_id: "free" } });
});

test("plan_id not_in compiles to a $none quantifier", () => {
	const filter = groupsToMigrationFilter(
		group({ field: "plan_id", operator: "not_in", values: ["free", "trial"] }),
		{},
	);
	expect(planOf(filter)).toEqual({
		$none: { plan_id: { $in: ["free", "trial"] } },
	});
});

test("positive plan_id stays a $some matcher", () => {
	const filter = groupsToMigrationFilter(
		group({ field: "plan_id", operator: "is", values: ["pro"] }),
		{},
	);
	expect(planOf(filter)).toEqual({ plan_id: "pro" });
});

test("plan_id is_not round-trips back to the is_not operator", () => {
	const filter: MigrationFilter = {
		customer: { plan: { $none: { plan_id: "free" } } },
	};
	const rules = buildGroups(filter).flatMap((g) => g.rules);
	expect(rules).toContainEqual({
		field: "plan_id",
		operator: "is_not",
		values: ["free"],
	});
});

// Two plan rows in one group = "has BOTH" — independent $and quantifiers, not
// a single plan that is both (which silently dropped the first condition).
test("two plan rows in a group compile to customer-level $and", () => {
	const filter = groupsToMigrationFilter(
		group(
			{ field: "plan_id", operator: "is", values: ["free"] },
			{ field: "plan_id", operator: "in", values: ["pro_6mo", "pro_3mo"] },
		),
		{},
	);
	expect(filter.customer).toEqual({
		$and: [
			{ plan: { plan_id: "free" } },
			{ plan: { plan_id: { $in: ["pro_6mo", "pro_3mo"] } } },
		],
	});
});

test("a plan row and plan properties merge into one plan filter", () => {
	const filter = groupsToMigrationFilter(
		group(
			{ field: "plan_id", operator: "is", values: ["pro"] },
			{ field: "custom", operator: "is", values: ["false"] },
			{ field: "paid", operator: "is", values: ["true"] },
			{ field: "recurring", operator: "is", values: ["true"] },
			{ field: "price", operator: "exists", values: [] },
		),
		{},
	);
	expect(filter.customer).toEqual({
		plan: {
			plan_id: "pro",
			custom: false,
			paid: true,
			recurring: true,
			price: { $ne: null },
		},
	});
});

test("plan and custom $and round-trips to a merged plan filter", () => {
	const filter: MigrationFilter = {
		customer: {
			$and: [{ plan: { plan_id: "dedicated" } }, { plan: { custom: false } }],
		},
	};
	const groups = buildGroups(filter);
	expect(groupsToMigrationFilter(groups, {})).toEqual({
		customer: { plan: { plan_id: "dedicated", custom: false } },
	});
});

test("plan properties without a plan row compile to one plan filter", () => {
	const filter = groupsToMigrationFilter(
		group(
			{ field: "custom", operator: "is", values: ["false"] },
			{ field: "price", operator: "not_exists", values: [] },
		),
		{},
	);
	expect(filter.customer).toEqual({
		plan: { custom: false, price: null },
	});
});

test("duplicate plan rows stay independent from plan properties", () => {
	const filter = groupsToMigrationFilter(
		group(
			{ field: "plan_id", operator: "is", values: ["free"] },
			{ field: "plan_id", operator: "is", values: ["pro"] },
			{ field: "custom", operator: "is", values: ["false"] },
		),
		{},
	);
	expect(filter.customer).toEqual({
		$and: [
			{ plan: { plan_id: "free" } },
			{ plan: { plan_id: "pro" } },
			{ plan: { custom: false } },
		],
	});
});

test("separate groups compile to customer-level $or", () => {
	const filter = groupsToMigrationFilter(
		[
			{ rules: [{ field: "plan_id", operator: "is", values: ["free"] }] },
			{ rules: [{ field: "plan_id", operator: "is", values: ["pro"] }] },
		],
		{},
	);
	expect(filter.customer).toEqual({
		$or: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
	});
});

test("customer_id is hoisted above an $and group", () => {
	const filter = groupsToMigrationFilter(
		group(
			{ field: "customer_id", operator: "is", values: ["cus_1"] },
			{ field: "plan_id", operator: "is", values: ["free"] },
			{ field: "plan_id", operator: "is", values: ["pro"] },
		),
		{},
	);
	expect(filter.customer).toEqual({
		customer_id: "cus_1",
		$and: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
	});
});

test("$and round-trips back to two plan rows in one group", () => {
	const filter: MigrationFilter = {
		customer: {
			$and: [
				{ plan: { plan_id: "free" } },
				{ plan: { plan_id: { $in: ["pro_6mo", "pro_3mo"] } } },
			],
		},
	};
	const groups = buildGroups(filter);
	expect(groups).toHaveLength(1);
	expect(groups[0].rules).toEqual([
		{ field: "plan_id", operator: "is", values: ["free"] },
		{ field: "plan_id", operator: "in", values: ["pro_6mo", "pro_3mo"] },
	]);
});

test("$or round-trips back to two OR-groups", () => {
	const filter: MigrationFilter = {
		customer: {
			$or: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
		},
	};
	const groups = buildGroups(filter);
	expect(groups).toHaveLength(2);
	expect(groups[0].rules).toEqual([
		{ field: "plan_id", operator: "is", values: ["free"] },
	]);
	expect(groups[1].rules).toEqual([
		{ field: "plan_id", operator: "is", values: ["pro"] },
	]);
});
