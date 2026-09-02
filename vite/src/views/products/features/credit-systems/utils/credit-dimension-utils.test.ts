import { expect, test } from "bun:test";
import type { CreditSchemaItem } from "@autumn/shared";
import {
	isApiAuthored,
	setRateKind,
	toAdjustmentList,
	toPriceList,
	withAdjustmentList,
	withoutDimensions,
	withPriceList,
} from "./creditDimensionUtils";

const row: CreditSchemaItem = {
	metered_feature_id: "cpu_minutes",
	credit_amount: 1,
	dimensions: {
		size_small: { match: { size: "small" }, credit_amount: 1 },
		size_large: { match: { size: "large" }, credit_amount: 16 },
	},
	multipliers: {
		lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.3 },
	},
};

test("a single-property card reads as a price list and an adjustment list", () => {
	expect(toPriceList(row)).toEqual({
		property: "size",
		rows: [
			{
				value: "small",
				dimension: { match: { size: "small" }, credit_amount: 1 },
			},
			{
				value: "large",
				dimension: { match: { size: "large" }, credit_amount: 16 },
			},
		],
	});
	expect(toAdjustmentList(row)).toEqual({
		property: "lifecycle",
		rows: [
			{
				value: "spot",
				multiplier: { match: { lifecycle: "spot" }, factor: 0.3 },
			},
		],
	});
	expect(isApiAuthored(row)).toBe(false);
});

test("multi-key or mixed-key rules are API-authored and never rewritten", () => {
	const multiKey: CreditSchemaItem = {
		...row,
		dimensions: {
			large_eu: {
				match: { size: "large", region: "eu" },
				credit_amount: 20,
			},
		},
	};
	const mixedKeys: CreditSchemaItem = {
		...row,
		dimensions: {
			size_large: { match: { size: "large" }, credit_amount: 16 },
			region_eu: { match: { region: "eu" }, credit_amount: 12 },
		},
	};

	expect(toPriceList(multiKey)).toBeUndefined();
	expect(isApiAuthored(multiKey)).toBe(true);
	expect(isApiAuthored(mixedKeys)).toBe(true);
});

test("writing the price list names each rule from the property and value", () => {
	const next = withPriceList({
		item: { metered_feature_id: "cpu_minutes", credit_amount: 1 },
		list: {
			property: "size",
			rows: [
				{ value: "xl", dimension: { match: {}, credit_amount: 30 } },
				{ value: "xl", dimension: { match: {}, credit_amount: 31 } },
			],
		},
	});

	expect(next.dimensions).toEqual({
		size_xl: { match: { size: "xl" }, credit_amount: 30 },
		size_xl_2: { match: { size: "xl" }, credit_amount: 31 },
	});
});

test("renaming the property rewrites every rule's match", () => {
	const list = toPriceList(row);
	if (!list) throw new Error("expected a price list");

	const next = withPriceList({
		item: row,
		list: { ...list, property: "tier" },
	});
	expect(Object.values(next.dimensions ?? {}).map((d) => d.match)).toEqual([
		{ tier: "small" },
		{ tier: "large" },
	]);
});

test("an empty list removes the key and the switch strips everything", () => {
	expect(
		withAdjustmentList({ item: row, list: { property: "lifecycle", rows: [] } })
			.multipliers,
	).toBeUndefined();
	expect(withoutDimensions(row)).toEqual({
		metered_feature_id: "cpu_minutes",
		credit_amount: 1,
	});
});

test("a value's rate switches between flat and tiered without losing its match", () => {
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
