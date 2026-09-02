import { expect, test } from "bun:test";
import type { CreditSchemaItem } from "@autumn/shared";
import {
	dimensionFields,
	rateRules,
	setRateKind,
	setRuleCell,
	withFields,
	withoutDimensions,
	withRateRules,
} from "./creditDimensionUtils";

const row: CreditSchemaItem = {
	metered_feature_id: "cpu_minutes",
	credit_amount: 1,
	dimensions: {
		size_large: { match: { size: "large" }, credit_amount: 16 },
		size_large_region_eu: {
			match: { size: "large", region: "eu" },
			credit_amount: 20,
		},
	},
	multipliers: {
		lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.3 },
	},
};

test("fields are the union of the rules' match keys", () => {
	expect(dimensionFields(row)).toEqual(["size", "region"]);
	expect(rateRules(row).map((rule) => rule.name)).toEqual([
		"size_large",
		"size_large_region_eu",
	]);
});

test("writing rules names each from its match and keeps multipliers", () => {
	const next = withRateRules({
		item: row,
		rules: [
			{ name: "", dimension: { match: { size: "xl" }, credit_amount: 30 } },
			{ name: "", dimension: { match: { size: "xl" }, credit_amount: 31 } },
		],
	});

	expect(next.dimensions).toEqual({
		size_xl: { match: { size: "xl" }, credit_amount: 30 },
		size_xl_2: { match: { size: "xl" }, credit_amount: 31 },
	});
	expect(next.multipliers).toEqual(row.multipliers);
});

test("removing a field strips it from every rule and drops rules left empty", () => {
	const next = withFields({ item: row, fields: ["region"] });

	expect(next.dimensions).toEqual({
		region_eu: { match: { region: "eu" }, credit_amount: 20 },
	});
});

test("a blank cell means any value", () => {
	const [rule] = rateRules(row);
	expect(
		setRuleCell({ rule, field: "size", value: "" }).dimension.match,
	).toEqual({});
	expect(
		setRuleCell({ rule, field: "region", value: "us" }).dimension.match,
	).toEqual({ size: "large", region: "us" });
});

test("the switch strips everything", () => {
	expect(withoutDimensions(row)).toEqual({
		metered_feature_id: "cpu_minutes",
		credit_amount: 1,
	});
});

test("a rate switches between flat and tiered without losing its match", () => {
	const tiered = setRateKind({
		dimension: { match: { size: "xl" }, credit_amount: 30 },
		kind: "tiered",
	});
	expect(tiered).toEqual({
		match: { size: "xl" },
		tier_behavior: "graduated",
		tiers: [{ to: "inf", credit_amount: 30 }],
	});
	expect(setRateKind({ dimension: tiered, kind: "flat" })).toEqual({
		match: { size: "xl" },
		credit_amount: 30,
	});
});
