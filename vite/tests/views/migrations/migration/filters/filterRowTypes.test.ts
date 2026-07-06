import { describe, expect, test } from "bun:test";
import {
	customerIdToStrings,
	planFilterToGroups,
	stringsToCustomerId,
} from "@/views/migrations/migration/filters/filterRowTypes";

describe("planFilterToGroups structure", () => {
	test("empty filter produces one group with no rules", () => {
		const groups = planFilterToGroups({});
		expect(groups).toHaveLength(1);
		expect(groups[0].rules).toHaveLength(0);
	});

	test("$or of pure plan selections collapses to a single plan row", () => {
		const groups = planFilterToGroups({
			$or: [{ plan_id: "a" }, { plan_id: "b" }],
		});
		expect(groups).toEqual([
			{ rules: [{ field: "plan_id", operator: "in", values: ["a", "b"] }] },
		]);
	});

	test("$or of non-selection filters produces multiple groups", () => {
		const groups = planFilterToGroups({
			$or: [{ paid: true }, { recurring: true }],
		});
		expect(groups).toHaveLength(2);
	});
});

describe("planFilterToGroups decodes matcher forms", () => {
	test("bare plan_id string", () => {
		expect(planFilterToGroups({ plan_id: "pro" })).toEqual([
			{ rules: [{ field: "plan_id", operator: "is", values: ["pro"] }] },
		]);
	});

	test("plan_id $in", () => {
		expect(planFilterToGroups({ plan_id: { $in: ["a", "b"] } })).toEqual([
			{ rules: [{ field: "plan_id", operator: "in", values: ["a", "b"] }] },
		]);
	});

	test("plan_id $ne", () => {
		expect(planFilterToGroups({ plan_id: { $ne: "old" } })).toEqual([
			{ rules: [{ field: "plan_id", operator: "is_not", values: ["old"] }] },
		]);
	});

	test("plan_id $nin", () => {
		expect(planFilterToGroups({ plan_id: { $nin: ["x"] } })).toEqual([
			{ rules: [{ field: "plan_id", operator: "not_in", values: ["x"] }] },
		]);
	});

	test("plan_id $regex", () => {
		expect(planFilterToGroups({ plan_id: { $regex: "^pro" } })).toEqual([
			{ rules: [{ field: "plan_id", operator: "regex", values: ["^pro"] }] },
		]);
	});

	test("plan_id $startsWith", () => {
		expect(planFilterToGroups({ plan_id: { $startsWith: "pro" } })).toEqual([
			{
				rules: [{ field: "plan_id", operator: "starts_with", values: ["pro"] }],
			},
		]);
	});

	test("booleans decode to is rules", () => {
		expect(planFilterToGroups({ paid: true })).toEqual([
			{ rules: [{ field: "paid", operator: "is", values: ["true"] }] },
		]);
		expect(planFilterToGroups({ custom: false })).toEqual([
			{ rules: [{ field: "custom", operator: "is", values: ["false"] }] },
		]);
	});

	test("price null decodes to not_exists, $ne null to exists", () => {
		expect(planFilterToGroups({ price: null })).toEqual([
			{ rules: [{ field: "price", operator: "not_exists", values: [] }] },
		]);
		expect(planFilterToGroups({ price: { $ne: null } })).toEqual([
			{ rules: [{ field: "price", operator: "exists", values: [] }] },
		]);
	});

	test("combined filters share one group", () => {
		const groups = planFilterToGroups({
			plan_id: { $regex: "^pro" },
			paid: true,
			recurring: true,
		});
		expect(groups).toHaveLength(1);
		expect(groups[0].rules.map((rule) => rule.field)).toEqual([
			"plan_id",
			"paid",
			"recurring",
		]);
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
