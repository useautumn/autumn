import { expect, test } from "bun:test";
import type { MigrationFilter } from "@autumn/shared";
import { buildGroups, groupsToMigrationFilter } from "./FilterForm";
import {
	type FilterGroupData,
	type FilterRule,
	planFilterToPlanKeys,
	planKeysToFilter,
} from "./filterRowTypes";

const group = (...rules: FilterRule[]): FilterGroupData[] => [{ rules }];
const planOf = (filter: MigrationFilter) => filter.customer?.plan;

// A specific version is bound to its plan in one quantifier — "pro:2" means
// "has Pro at version 2", never "has Pro AND has something at version 2".
test("a version-pinned plan key encodes to plan_id + version", () => {
	const filter = groupsToMigrationFilter(
		group({ field: "plan_id", operator: "is", values: ["pro:2"] }),
		{},
	);
	expect(planOf(filter)).toEqual({ plan_id: "pro", version: 2 });
});

test("a whole-plan key (no version) stays version-less", () => {
	expect(planKeysToFilter(["pro"])).toEqual({ plan_id: "pro" });
});

test("mixed whole + pinned keys encode to a plan-level $or", () => {
	const filter = groupsToMigrationFilter(
		group({ field: "plan_id", operator: "in", values: ["free", "pro:2"] }),
		{},
	);
	expect(planOf(filter)).toEqual({
		$or: [{ plan_id: "free" }, { plan_id: "pro", version: 2 }],
	});
});

test("version-less keys collapse to a $in", () => {
	expect(planKeysToFilter(["free", "pro"])).toEqual({
		plan_id: { $in: ["free", "pro"] },
	});
});

test("plan_id + version decodes back to a single pinned key", () => {
	expect(planFilterToPlanKeys({ plan_id: "pro", version: 2 })).toEqual([
		"pro:2",
	]);
});

test("$or of plan matchers decodes back to mixed keys", () => {
	expect(
		planFilterToPlanKeys({
			$or: [{ plan_id: "free" }, { plan_id: "pro", version: 2 }],
		}),
	).toEqual(["free", "pro:2"]);
});

test("a non-selection plan filter is not treated as plan keys", () => {
	expect(planFilterToPlanKeys({ paid: true })).toBeNull();
	expect(planFilterToPlanKeys({ item: { feature_id: "credits" } })).toBeNull();
});

test("version-pinned selection round-trips through the UI", () => {
	const filter: MigrationFilter = {
		customer: { plan: { plan_id: "pro", version: 2 } },
	};
	const rules = buildGroups(filter).flatMap((g) => g.rules);
	expect(rules).toEqual([
		{ field: "plan_id", operator: "is", values: ["pro:2"] },
	]);
});

test("mixed $or selection round-trips to one plan row", () => {
	const filter: MigrationFilter = {
		customer: {
			plan: { $or: [{ plan_id: "free" }, { plan_id: "pro", version: 2 }] },
		},
	};
	const rules = buildGroups(filter).flatMap((g) => g.rules);
	expect(rules).toEqual([
		{ field: "plan_id", operator: "in", values: ["free", "pro:2"] },
	]);
});
