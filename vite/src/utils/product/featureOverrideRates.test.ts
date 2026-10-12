import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	type ProductItem,
	type UpdatePlanOp,
} from "@autumn/shared";
import {
	type AddItem,
	featureOverrideRateCard,
	migrationOpRateRows,
	type RemoveFilter,
	rateChangeText,
	withEditedAddItem,
	withEditedRemoveFilter,
} from "./featureOverrideRates";

type Override = NonNullable<AddItem["feature_override"]>;
type DbOverride = NonNullable<
	NonNullable<ProductItem["config"]>["feature_override"]
>;

const features = [
	{ id: "gateway", name: "Gateway spend (USD)", type: FeatureType.Metered },
	{ id: "searches", name: "Searches", type: FeatureType.Metered },
	{
		id: "credits",
		name: "Credits",
		type: FeatureType.CreditSystem,
		config: {
			schema: [
				{ metered_feature_id: "gateway", credit_amount: 1 },
				{ metered_feature_id: "searches", credit_amount: 5 },
			],
		},
	},
	{
		id: "ai",
		name: "AI credits",
		type: FeatureType.AiCreditSystem,
		config: { schema: [], default_markup: 20 },
		model_markups: { "openai/gpt-4o": { markup: 50 } },
	},
] as Feature[];

const rates = (gateway: number, searches = 5): Override => ({
	credit_schema: [
		{ metered_feature_id: "gateway", credit_cost: gateway },
		{ metered_feature_id: "searches", credit_cost: searches },
	],
});
const inPlace = {
	schema: [
		{ metered_feature_id: "gateway", credit_amount: 3.571 },
		{ metered_feature_id: "searches", credit_amount: 5 },
	],
};
const add = (patch: Partial<AddItem> = {}): AddItem => ({
	feature_id: "credits",
	included: 100,
	reset: { interval: "month" },
	feature_override: rates(3.571),
	...patch,
});
const remove = (patch: Partial<RemoveFilter> = {}): RemoveFilter => ({
	feature_id: "credits",
	interval: "month",
	interval_count: 1,
	included: 100,
	...patch,
});
const stamped = (previous: Override, only = true) =>
	remove({
		previous_feature_override: previous,
		...(only && { only_feature_override_changed: true }),
	});
const op = (customize: UpdatePlanOp["customize"]) =>
	({
		type: "update_plan",
		plan_filter: { plan_id: "pro", version: 1 },
		customize,
	}) as UpdatePlanOp;
const catalog = (override?: DbOverride) => [
	{
		id: "pro",
		version: 1,
		items: [
			{
				feature_id: "credits",
				included_usage: 100,
				interval: "month",
				config: { feature_override: override },
			} as ProductItem,
		],
	},
];
const rowsOf = (operation: UpdatePlanOp, products = catalog()) => {
	const { rows, mergedRemoveIndices } = migrationOpRateRows({
		op: operation,
		products,
		features,
	});
	return {
		rows: rows.map((row) => ({
			updated: row.updated,
			lines: row.changes.map(
				(change) => `${change.label}: ${rateChangeText(change)}`,
			),
		})),
		merged: [...mergedRemoveIndices],
	};
};
const single = (lines: string[], updated = false) => ({
	rows: [{ updated, lines }],
	merged: updated ? [0] : [],
});

test.each([
	[
		"flat, per units",
		{
			schema: [
				{
					metered_feature_id: "gateway",
					credit_amount: 1500,
					feature_amount: 1000,
				},
			],
		},
		["Gateway Spend (USD): 1,500 credits per 1,000"],
	],
	[
		"tiered",
		{
			schema: [
				{
					metered_feature_id: "searches",
					tier_behavior: "graduated",
					tiers: [
						{ to: 100, credit_amount: 3 },
						{ to: "inf", credit_amount: 1 },
					],
				},
			],
		},
		["Searches: 1–3 credits (tiered)"],
	],
	[
		"dimensioned",
		{
			schema: [
				{
					metered_feature_id: "gateway",
					credit_amount: 1,
					dimensions: { fast: { match: { speed: "fast" }, credit_amount: 2 } },
					multipliers: { batch: { match: { batch: "true" }, factor: 0.5 } },
				},
			],
		},
		["Gateway Spend (USD): varies by event · 1 rate, 1 multiplier"],
	],
	[
		"markups",
		{
			markups: {
				provider_markups: { anthropic: { markup: 15 } },
				model_markups: { "openai/o3": { markup: 10 } },
			},
		},
		["Default: 0% markup", "anthropic: 15% markup", "Per-model: 1 model"],
	],
] as [string, DbOverride, string[]][])(
	"the customer sheet's rate card: %s",
	(_, override, expected) => {
		expect(
			featureOverrideRateCard({ override, features }).map(
				({ label, value }) => `${label}: ${value}`,
			),
		).toEqual(expected);
	},
);

const priority = (value: number) => ({
	credit_schema: [
		{
			metered_feature_id: "gateway",
			credit_cost: 1,
			dimensions: {
				fast: { match: { speed: "fast" }, credit_cost: 2, priority: value },
			},
		},
	],
});

describe("migrationOpRateRows", () => {
	test.each([
		[
			"a stamped override-only change merges into one updated row",
			op({ add_items: [add()], remove_items: [stamped(rates(2.857))] }),
			single(["Gateway spend (USD): 2.857 → 3.571 credits"], true),
		],
		[
			"two changed rates give two subrows",
			op({
				add_items: [add({ feature_override: rates(3.571, 6) })],
				remove_items: [stamped(rates(2.857))],
			}),
			single(
				[
					"Gateway spend (USD): 2.857 → 3.571 credits",
					"Searches: 5 → 6 credits",
				],
				true,
			),
		],
		[
			"an empty stamp diffs against the credit system's own rates",
			op({ add_items: [add()], remove_items: [stamped({})] }),
			single(["Gateway spend (USD): 1 → 3.571 credits"], true),
		],
		[
			"a stamp without the flag keeps the add/remove pair",
			op({
				add_items: [add({ included: 200 })],
				remove_items: [stamped(rates(2.857), false)],
			}),
			single(["Gateway spend (USD): 2.857 → 3.571 credits"]),
		],
		[
			"an added item with no remove shows its full rate card",
			op({ add_items: [add()] }),
			single(["Gateway spend (USD): 3.571 credits", "Searches: 5 credits"]),
		],
		[
			"a removed override falls back to the credit system's rates",
			op({
				add_items: [add({ feature_override: undefined })],
				remove_items: [stamped(rates(4), false)],
			}),
			single(["Gateway spend (USD): 4 → 1 credits"]),
		],
		[
			"a priority-only dimension change still shows",
			op({
				add_items: [add({ feature_override: priority(2) })],
				remove_items: [stamped(priority(1))],
			}),
			single(
				[
					"Gateway spend (USD): 1 credits · fast (speed=fast) priority 1 2 credits → 1 credits · fast (speed=fast) priority 2 2 credits",
				],
				true,
			),
		],
		[
			"removing a markup override shows the inherited model markups",
			op({
				add_items: [add({ feature_id: "ai", feature_override: undefined })],
				remove_items: [
					remove({
						feature_id: "ai",
						previous_feature_override: { markups: { default_markup: 20 } },
					}),
				],
			}),
			single(["Per-model: openai/gpt-4o 50% markup"]),
		],
	] as [string, UpdatePlanOp, ReturnType<typeof rowsOf>][])(
		"%s",
		(_, operation, expected) => {
			expect(rowsOf(operation)).toEqual(expected);
		},
	);

	test("an unchanged override adds nothing", () => {
		const unchanged = op({
			add_items: [add({ included: 200 })],
			remove_items: [remove()],
		});
		expect(rowsOf(unchanged, catalog(inPlace)).rows[0].lines).toEqual([]);
	});

	test("an old unstamped draft on a catalog updated in place shows the new rate card", () => {
		const old = op({ add_items: [add()], remove_items: [remove()] });
		expect(rowsOf(old, catalog(inPlace))).toEqual(
			single(["Gateway spend (USD): 3.571 credits", "Searches: 5 credits"]),
		);
	});

	test("two items of one feature pair by cadence, not by order", () => {
		const { rows } = migrationOpRateRows({
			op: op({
				add_items: [
					add({ reset: { interval: "day" }, feature_override: rates(9) }),
					add(),
				],
				remove_items: [
					stamped(rates(2)),
					remove({ interval: "day", previous_feature_override: rates(8) }),
				],
			}),
			products: [],
			features,
		});
		expect(rows.map((row) => [row.removeIndex, row.changes[0]?.from])).toEqual([
			[1, "8 credits"],
			[0, "2 credits"],
		]);
	});
});

describe("op form edits", () => {
	const customize = {
		add_items: [add()],
		remove_items: [stamped(rates(2.857))],
	};
	const edited = (item: AddItem) =>
		withEditedAddItem({ customize, addIndex: 0, item });

	test.each([
		["included", add({ included: 200 })],
		[
			"price",
			add({ price: { amount: 10, interval: "month" } } as Partial<AddItem>),
		],
		["reset", add({ reset: { interval: "month", interval_count: 3 } })],
	])("editing %s brings the pair back but keeps the old rates", (_, item) => {
		const filter = edited(item).remove_items?.[0];
		expect(filter?.only_feature_override_changed).toBeUndefined();
		expect(filter?.previous_feature_override).toEqual(rates(2.857));
	});

	test("editing only the override stays merged, and an editor without overrides keeps it", () => {
		expect(
			edited(add({ feature_override: rates(5) })).remove_items?.[0]
				.only_feature_override_changed,
		).toBe(true);
		const kept = edited(add({ feature_override: undefined }));
		expect(kept.add_items?.[0].feature_override).toEqual(rates(3.571));
		expect(kept.remove_items?.[0].only_feature_override_changed).toBe(true);
	});

	test("a grant edit on an item that inherited its rates still shows them", () => {
		const after = withEditedAddItem({
			customize: { add_items: [add()], remove_items: [stamped({})] },
			addIndex: 0,
			item: add({ included: 200 }),
		});
		expect(rowsOf(op(after))).toEqual(
			single(["Gateway spend (USD): 1 → 3.571 credits"]),
		);
	});

	test("a remove filter edited to match other items drops its stamps", () => {
		const previous = stamped(rates(2));
		expect(withEditedRemoveFilter({ previous, next: previous })).toEqual(
			previous,
		);
		expect(
			withEditedRemoveFilter({
				previous,
				next: { ...previous, included: 500 },
			}),
		).toEqual(remove({ included: 500 }));
	});
});
