import { expect, test } from "bun:test";
import type { CreditSchemaItem } from "@autumn/shared";
import {
	dimensionValues,
	mergeDimensionValues,
	multiplierRules,
	rateRules,
	setMatchValue,
	withAllowedValues,
	withMultiplierRules,
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

test("fields and values are whatever rates and multipliers reference", () => {
	expect(dimensionValues(row)).toEqual({
		size: ["large"],
		region: ["eu"],
		lifecycle: ["spot"],
	});
	expect(rateRules(row).map((rule) => rule.name)).toEqual([
		"size_large",
		"size_large_region_eu",
	]);
});

test("draft fields and values merge in after the used ones, without duplicates", () => {
	expect(
		mergeDimensionValues(dimensionValues(row), {
			size: ["large", "small"],
			tier: [],
		}),
	).toEqual({
		size: ["large", "small"],
		region: ["eu"],
		lifecycle: ["spot"],
		tier: [],
	});
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

test("removing a field drops every rate and multiplier that matched on it", () => {
	const next = withAllowedValues({
		item: row,
		allowed: { size: ["large"], region: ["eu"] },
	});

	expect(next.dimensions).toEqual(row.dimensions);
	expect(next.multipliers).toBeUndefined();
});

test("removing a value drops only the rates that matched it", () => {
	const next = withAllowedValues({
		item: row,
		allowed: { size: ["large"], region: [], lifecycle: ["spot"] },
	});

	expect(next.dimensions).toEqual({
		size_large: { match: { size: "large" }, credit_amount: 16 },
	});
	expect(next.multipliers).toEqual(row.multipliers);
});

test("multipliers are named from their match like rates, and rates are kept", () => {
	const next = withMultiplierRules({
		item: row,
		rules: [
			{ name: "", multiplier: { match: { region: "eu" }, factor: 1.2 } },
			{ name: "", multiplier: { match: { region: "eu" }, factor: 0.5 } },
		],
	});

	expect(next.multipliers).toEqual({
		region_eu: { match: { region: "eu" }, factor: 1.2 },
		region_eu_2: { match: { region: "eu" }, factor: 0.5 },
	});
	expect(next.dimensions).toEqual(row.dimensions);
	expect(multiplierRules(next).map((rule) => rule.name)).toEqual([
		"region_eu",
		"region_eu_2",
	]);
	expect(
		withMultiplierRules({ item: row, rules: [] }).multipliers,
	).toBeUndefined();
});

test("an unset cell means any value", () => {
	const [rule] = rateRules(row);
	expect(
		setMatchValue({
			match: rule.dimension.match,
			field: "size",
			value: undefined,
		}),
	).toEqual({});
	expect(
		setMatchValue({
			match: rule.dimension.match,
			field: "region",
			value: "us",
		}),
	).toEqual({ size: "large", region: "us" });
});

test("the switch strips everything", () => {
	expect(withoutDimensions(row)).toEqual({
		metered_feature_id: "cpu_minutes",
		credit_amount: 1,
	});
});
