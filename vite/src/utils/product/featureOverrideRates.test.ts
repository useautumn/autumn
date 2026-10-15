import { expect, test } from "bun:test";
import { type Feature, FeatureType, type UpdatePlanOp } from "@autumn/shared";
import { migrationOpRateRows } from "./featureOverrideRates";

type Customize = NonNullable<UpdatePlanOp["customize"]>;
type Add = NonNullable<Customize["add_items"]>[number];
type Remove = NonNullable<Customize["remove_items"]>[number];

const features = [
	{ id: "gateway", name: "Gateway spend (USD)", type: FeatureType.Metered },
	{
		id: "credits",
		type: FeatureType.CreditSystem,
		config: { schema: [{ metered_feature_id: "gateway", credit_amount: 1 }] },
	},
] as Feature[];
const rates = (credit_cost: number, tiered = false) => ({
	credit_schema: [
		tiered
			? {
					metered_feature_id: "gateway",
					tier_behavior: "graduated" as const,
					tiers: [{ to: "inf" as const, credit_cost }],
				}
			: { metered_feature_id: "gateway", credit_cost },
	],
});
const add = (patch: Partial<Add> = {}): Add => ({
	feature_id: "credits",
	included: 100,
	reset: { interval: "month" },
	feature_override: rates(3.571),
	...patch,
});
const remove = (patch: Partial<Remove> = {}): Remove => ({
	feature_id: "credits",
	interval: "month",
	included: 100,
	previous_feature_override: rates(2.857),
	...patch,
});
const rows = (add_items: Add[], remove_items: Remove[]) =>
	migrationOpRateRows({
		op: {
			type: "update_plan",
			plan_filter: { plan_id: "pro" },
			customize: { add_items, remove_items },
		} as UpdatePlanOp,
		features,
	}).rows.map((row) => [
		row.updated,
		...row.changes.map((c) => `${c.label} ${c.from} → ${c.to}`),
	]);
const changed = "Gateway spend (USD) 2.857 → 3.571";
const priced = { price: { amount: 5, interval: "month" } } as Partial<Add>;

test.each([
	["a rate-only change merges", {}, {}, [true, changed]],
	["a new grant keeps the pair", { included: 200 }, {}, [false, changed]],
	["a priced item keeps the pair", priced, {}, [false, changed]],
	[
		"a formerly priced item keeps the pair",
		{},
		{ billing_method: "prepaid" },
		[false, changed],
	],
	[
		"a removed rate is summarised",
		{
			feature_override: {
				credit_schema: [{ metered_feature_id: "gateway", excluded: true }],
			},
		},
		{},
		[true, "Rate card changed undefined → undefined"],
	],
	[
		"an empty override inherits the credit system's rate",
		{ feature_override: { credit_schema: [] } },
		{},
		[true, "Gateway spend (USD) 2.857 → 1"],
	],
	[
		"a per-units rate is summarised",
		{
			feature_override: {
				credit_schema: [
					{ metered_feature_id: "gateway", credit_cost: 2, billing_units: 100 },
				],
			},
		},
		{ previous_feature_override: rates(2) },
		[true, "Rate card changed undefined → undefined"],
	],
	[
		"an empty stamp diffs against the default rates",
		{},
		{ previous_feature_override: {} },
		[true, "Gateway spend (USD) 1 → 3.571"],
	],
	[
		"no stamp shows only the new rate card",
		{},
		{ previous_feature_override: undefined },
		[false, "Gateway spend (USD) undefined → 3.571"],
	],
	[
		"a tiered change is summarised",
		{ feature_override: rates(2, true) },
		{ previous_feature_override: rates(1, true) },
		[true, "Rate card changed undefined → undefined"],
	],
	[
		"excluding a feature the credit system omits changes no rate",
		{
			feature_override: {
				credit_schema: [
					{ metered_feature_id: "search", excluded: true },
					{ metered_feature_id: "gateway", credit_cost: 2.857 },
				],
			},
		},
		{},
		[false],
	],
	[
		"reordered rows change no rate",
		{
			feature_override: {
				credit_schema: [
					{ metered_feature_id: "search", excluded: true },
					{ metered_feature_id: "gateway", credit_cost: 2.857 },
				],
			},
		},
		{
			previous_feature_override: {
				credit_schema: [
					{ metered_feature_id: "gateway", credit_cost: 2.857 },
					{ metered_feature_id: "search", excluded: true },
				],
			},
		},
		[false],
	],
] as [string, Partial<Add>, Partial<Remove>, (string | boolean)[]][])(
	"%s",
	(_, addPatch, removePatch, expected) => {
		expect(rows([add(addPatch)], [remove(removePatch)])).toEqual([expected]);
	},
);

test("items of one feature pair by cadence", () => {
	const daily = remove({
		interval: "day",
		previous_feature_override: rates(9),
	});
	expect(
		rows([add({ reset: { interval: "day" } }), add()], [remove(), daily]),
	).toEqual([
		[true, "Gateway spend (USD) 9 → 3.571"],
		[true, changed],
	]);
});

test("features the override doesn't list stay inherited, not removed", () => {
	const twoFeatures = [
		...features.filter((f) => f.id !== "credits"),
		{ id: "search", name: "Searches", type: FeatureType.Metered },
		{
			id: "credits",
			type: FeatureType.CreditSystem,
			config: {
				schema: [
					{ metered_feature_id: "gateway", credit_amount: 1 },
					{ metered_feature_id: "search", credit_amount: 0.5 },
				],
			},
		},
	] as Feature[];
	const result = migrationOpRateRows({
		op: {
			type: "update_plan",
			plan_filter: { plan_id: "pro" },
			customize: { add_items: [add()], remove_items: [remove()] },
		} as UpdatePlanOp,
		features: twoFeatures,
	}).rows.map((row) =>
		row.changes.map((c) => `${c.label} ${c.from} → ${c.to}`),
	);
	expect(result).toEqual([[changed]]);
});
