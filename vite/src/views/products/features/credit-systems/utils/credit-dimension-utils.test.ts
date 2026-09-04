import { expect, test } from "bun:test";
import {
	CREDIT_DIMENSION_NAME_MAX_LENGTH,
	type CreditSchemaItem,
} from "@autumn/shared";
import {
	createRateDraft,
	dimensionValues,
	draftsOf,
	filledRateRows,
	mergeDimensionValues,
	missingCombinationCount,
	multiplierRules,
	nameRateRows,
	rateRowsOf,
	rateRules,
	setMatchValue,
	withAllowedValues,
	withMultiplierRules,
	withoutDimensions,
	withRateCredits,
	withRateMatch,
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

test("missing combinations count the full grid minus rows already there", () => {
	expect(
		missingCombinationCount({
			values: { size: ["small", "large"], region: ["eu", "us"], tier: [] },
			rows: rateRowsOf({ rules: rateRules(row), drafts: [] }),
		}),
	).toBe(3);
	expect(missingCombinationCount({ values: { size: [] }, rows: [] })).toBe(0);
});

test("filling keeps exact rows, inherits from covering rules, drafts the rest, and folds partial rows away", () => {
	const filled = filledRateRows({
		values: { size: ["small", "large"], region: ["eu", "us"] },
		rows: rateRowsOf({
			rules: rateRules(row),
			drafts: [createRateDraft({ size: "small" })],
		}),
	});

	expect(
		filled.map(({ name, match, dimension }) => ({ name, match, dimension })),
	).toEqual([
		{ name: "", match: { size: "small", region: "eu" }, dimension: undefined },
		{ name: "", match: { size: "small", region: "us" }, dimension: undefined },
		{
			name: "size_large_region_eu",
			match: { size: "large", region: "eu" },
			dimension: { match: { size: "large", region: "eu" }, credit_amount: 20 },
		},
		{
			name: "",
			match: { size: "large", region: "us" },
			dimension: { match: { size: "large", region: "us" }, credit_amount: 16 },
		},
	]);

	// Every row is independently addressable, even when two share a match.
	expect(new Set(filled.map((r) => r.key)).size).toBe(filled.length);
});

test("dropping the last rate that used a value keeps the value in the merged set", () => {
	const remaining = withRateRules({ item: row, rules: [] });

	// The editor keeps the values it loaded, so removing every rate that matched
	// on region must not remove region itself.
	expect(dimensionValues(remaining).region).toBeUndefined();
	expect(
		mergeDimensionValues(dimensionValues(row), dimensionValues(remaining)),
	).toEqual({
		size: ["large"],
		region: ["eu"],
		lifecycle: ["spot"],
	});
});

test("collision suffixes keep names within the API limit", () => {
	const longValue = "v".repeat(80);
	const next = withRateRules({
		item: row,
		rules: [
			{ name: "", dimension: { match: { size: longValue }, credit_amount: 1 } },
			{ name: "", dimension: { match: { size: longValue }, credit_amount: 2 } },
		],
	});

	const names = Object.keys(next.dimensions ?? {});
	expect(names).toHaveLength(2);
	for (const name of names)
		expect(name.length).toBeLessThanOrEqual(CREDIT_DIMENSION_NAME_MAX_LENGTH);
});

test("two rows with the same match stay independently addressable", () => {
	const rows = rateRowsOf({
		rules: [],
		drafts: [createRateDraft(), createRateDraft()],
	});

	expect(rows).toHaveLength(2);
	expect(rows[0].key).not.toBe(rows[1].key);

	// Editing one leaves the other alone, which a match-derived id could not do.
	const edited = [
		withRateMatch({ row: rows[0], match: { size: "large" } }),
		rows[1],
	];
	expect(draftsOf(edited).map((draft) => draft.match)).toEqual([
		{ size: "large" },
		{},
	]);
});

test("a draft keeps its key once it is saved as a rule", () => {
	const draft = createRateDraft({ size: "large" });
	const [row] = rateRowsOf({ rules: [], drafts: [draft] });

	// Typing a cost turns the draft into a rule, which the item is rebuilt from.
	const priced = withRateCredits({ row, credits: 5 });
	const [named] = nameRateRows([priced]);
	const keysByRuleName = new Map([[named.name, named.key]]);

	const dimension = named.dimension ?? { match: {}, credit_amount: 0 };
	const [rebuilt] = rateRowsOf({
		rules: [{ name: named.name, dimension }],
		drafts: [],
		keysByRuleName,
	});

	expect(rebuilt.key).toBe(draft.key);
});
