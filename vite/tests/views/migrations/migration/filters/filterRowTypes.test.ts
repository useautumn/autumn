import { describe, expect, test } from "bun:test";
import type { PlanFilter } from "@autumn/shared";
import {
	customerIdToStrings,
	groupsToPlanFilter,
	planFilterToGroups,
	stringsToCustomerId,
} from "@/views/migrations/migration/filters/filterRowTypes";

describe("planFilterToGroups -> groupsToPlanFilter roundtrip", () => {
	const roundtrip = (input: PlanFilter): PlanFilter => {
		const groups = planFilterToGroups(input);
		return groupsToPlanFilter(groups);
	};

	test("empty filter", () => {
		expect(roundtrip({})).toEqual({});
	});

	test("plan_id bare string", () => {
		expect(roundtrip({ plan_id: "pro" })).toEqual({ plan_id: "pro" });
	});

	test("plan_id $in", () => {
		const input = { plan_id: { $in: ["a", "b"] } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("plan_id $nin", () => {
		const input = { plan_id: { $nin: ["x"] } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("plan_id $ne", () => {
		const input = { plan_id: { $ne: "old" } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("plan_id $regex", () => {
		const input = { plan_id: { $regex: "^pro" } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("plan_id $startsWith", () => {
		const input = { plan_id: { $startsWith: "pro" } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("paid: true", () => {
		expect(roundtrip({ paid: true })).toEqual({ paid: true });
	});

	test("paid: false", () => {
		expect(roundtrip({ paid: false })).toEqual({ paid: false });
	});

	test("recurring: true", () => {
		expect(roundtrip({ recurring: true })).toEqual({ recurring: true });
	});

	test("price: null (free plan)", () => {
		expect(roundtrip({ price: null })).toEqual({ price: null });
	});

	test("price: { $ne: null } (paid plan)", () => {
		expect(roundtrip({ price: { $ne: null } })).toEqual({
			price: { $ne: null },
		});
	});

	test("item with implicit $some (feature_id)", () => {
		const input: PlanFilter = { item: { feature_id: "credits" } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("item with $every wrapper", () => {
		const input: PlanFilter = {
			item: { $every: { feature_id: "credits" } },
		};
		expect(roundtrip(input)).toEqual(input);
	});

	test("item with $none wrapper", () => {
		const input: PlanFilter = {
			item: { $none: { feature_id: "credits" } },
		};
		expect(roundtrip(input)).toEqual(input);
	});

	test("item unlimited boolean", () => {
		const input: PlanFilter = { item: { unlimited: true } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("item price null (free item)", () => {
		const input: PlanFilter = { item: { price: null } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("item price { $ne: null } (paid item)", () => {
		const input: PlanFilter = { item: { price: { $ne: null } } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("item billing_method", () => {
		const input: PlanFilter = {
			item: { price: { billing_method: "prepaid" } },
		};
		const result = roundtrip(input);
		expect(result.item).toBeDefined();
		const price = (result.item as Record<string, unknown>).price as Record<string, unknown>;
		expect(price.billing_method).toBe("prepaid");
	});

	test("$or groups", () => {
		const input: PlanFilter = {
			plan_id: "pro",
			$or: [{ plan_id: "enterprise" }, { plan_id: "team" }],
		};
		expect(roundtrip(input)).toEqual(input);
	});

	test("combined filters", () => {
		const input: PlanFilter = {
			plan_id: "pro",
			paid: true,
			recurring: true,
			item: { feature_id: "credits", unlimited: false },
		};
		expect(roundtrip(input)).toEqual(input);
	});
});

describe("planFilterToGroups structure", () => {
	test("empty filter produces one group with no rules", () => {
		const groups = planFilterToGroups({});
		expect(groups).toHaveLength(1);
		expect(groups[0].rules).toHaveLength(0);
	});

	test("$or produces multiple groups", () => {
		const groups = planFilterToGroups({
			plan_id: "a",
			$or: [{ plan_id: "b" }],
		});
		expect(groups).toHaveLength(2);
	});

	test("$every item mode produces item_mode rule", () => {
		const groups = planFilterToGroups({
			item: { $every: { feature_id: "x" } },
		});
		const modeRule = groups[0].rules.find((r) => r.field === "item_mode");
		expect(modeRule).toBeDefined();
		expect(modeRule!.values).toEqual(["every"]);
	});

	test("implicit $some does not produce item_mode rule", () => {
		const groups = planFilterToGroups({
			item: { feature_id: "x" },
		});
		const modeRule = groups[0].rules.find((r) => r.field === "item_mode");
		expect(modeRule).toBeUndefined();
	});
});

describe("customerIdToStrings", () => {
	test("undefined returns empty array", () => {
		expect(customerIdToStrings(undefined)).toEqual([]);
	});

	test("null returns empty array", () => {
		expect(customerIdToStrings(null)).toEqual([]);
	});

	test("bare string returns single-element array", () => {
		expect(customerIdToStrings("cus_1")).toEqual(["cus_1"]);
	});

	test("empty string returns empty array", () => {
		expect(customerIdToStrings("")).toEqual([]);
	});

	test("$eq returns single-element array", () => {
		expect(customerIdToStrings({ $eq: "cus_1" })).toEqual(["cus_1"]);
	});

	test("$ne returns single-element array", () => {
		expect(customerIdToStrings({ $ne: "cus_1" })).toEqual(["cus_1"]);
	});

	test("$in returns all values", () => {
		expect(customerIdToStrings({ $in: ["a", "b", "c"] })).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	test("$nin returns all values", () => {
		expect(customerIdToStrings({ $nin: ["x"] })).toEqual(["x"]);
	});
});

describe("stringsToCustomerId", () => {
	test("empty array returns undefined", () => {
		expect(stringsToCustomerId([])).toBeUndefined();
	});

	test("array with only whitespace returns undefined", () => {
		expect(stringsToCustomerId(["  ", ""])).toBeUndefined();
	});

	test("single value returns bare string", () => {
		expect(stringsToCustomerId(["cus_1"])).toBe("cus_1");
	});

	test("multiple values returns $in", () => {
		expect(stringsToCustomerId(["a", "b"])).toEqual({ $in: ["a", "b"] });
	});

	test("trims whitespace", () => {
		expect(stringsToCustomerId(["  a  ", " b "])).toEqual({
			$in: ["a", "b"],
		});
	});
});

describe("customerIdToStrings -> stringsToCustomerId roundtrip", () => {
	test("bare string roundtrips", () => {
		const input = "cus_1";
		expect(stringsToCustomerId(customerIdToStrings(input))).toBe(input);
	});

	test("$in roundtrips", () => {
		const input = { $in: ["a", "b"] as string[] };
		expect(stringsToCustomerId(customerIdToStrings(input))).toEqual(input);
	});

	test("undefined roundtrips", () => {
		expect(stringsToCustomerId(customerIdToStrings(undefined))).toBeUndefined();
	});
});

describe("planFilterToGroups -> groupsToPlanFilter: version (NumberMatcher)", () => {
	const roundtrip = (input: PlanFilter): PlanFilter => {
		const groups = planFilterToGroups(input);
		return groupsToPlanFilter(groups);
	};

	test("bare number roundtrips", () => {
		expect(roundtrip({ version: 2 })).toEqual({ version: 2 });
	});

	test("explicit null roundtrips", () => {
		// Regression: previously the UI dropped `version: null` because
		// ruleToNumberMatcher returned undefined for an empty values array.
		expect(roundtrip({ version: null })).toEqual({ version: null });
	});

	test("$eq number roundtrips (simplified to bare value)", () => {
		expect(roundtrip({ version: { $eq: 3 } })).toEqual({ version: 3 });
	});

	test("$ne number roundtrips", () => {
		const input = { version: { $ne: 1 } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("$in roundtrips", () => {
		const input = { version: { $in: [1, 2, 3] } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("$nin roundtrips", () => {
		const input = { version: { $nin: [4, 5] } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("$gte roundtrips", () => {
		const input = { version: { $gte: 2 } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("$lt roundtrips", () => {
		const input = { version: { $lt: 5 } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("$gte + $lte (range) preserves BOTH constraints", () => {
		// Regression: previously emitted only the first operator, silently
		// broadening "versions 2–4" to "versions ≥ 2".
		const input = { version: { $gte: 2, $lte: 4 } };
		expect(roundtrip(input)).toEqual(input);
	});

	test("$gt + $lt (open range) preserves BOTH constraints", () => {
		const input = { version: { $gt: 1, $lt: 10 } };
		expect(roundtrip(input)).toEqual(input);
	});
});

describe("planFilterToGroups: version emits multiple rules for combined matchers", () => {
	test("single operator → single rule", () => {
		const groups = planFilterToGroups({ version: { $gte: 2 } });
		const versionRules = groups[0].rules.filter((r) => r.field === "version");
		expect(versionRules.length).toBe(1);
		expect(versionRules[0]).toEqual({
			field: "version",
			operator: "gte",
			values: ["2"],
		});
	});

	test("$gte + $lte → two rules in the same group", () => {
		const groups = planFilterToGroups({ version: { $gte: 2, $lte: 4 } });
		const versionRules = groups[0].rules.filter((r) => r.field === "version");
		expect(versionRules.length).toBe(2);
		const operators = versionRules.map((r) => r.operator).sort();
		expect(operators).toEqual(["gte", "lte"]);
	});

	test("null → single empty `is` rule", () => {
		const groups = planFilterToGroups({ version: null });
		const versionRules = groups[0].rules.filter((r) => r.field === "version");
		expect(versionRules).toEqual([
			{ field: "version", operator: "is", values: [] },
		]);
	});
});
