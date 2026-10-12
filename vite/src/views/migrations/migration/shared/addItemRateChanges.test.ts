import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	type ProductItem,
	type UpdatePlanOp,
} from "@autumn/shared";
import { rateChangeText } from "@/views/products/features/credit-systems/utils/featureOverrideRateChanges";
import { addItemRateChanges } from "./addItemRateChanges";

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
] as Feature[];

type AddItem = NonNullable<
	NonNullable<UpdatePlanOp["customize"]>["add_items"]
>[number];
type Override = NonNullable<AddItem["feature_override"]>;
type CatalogOverride = NonNullable<
	NonNullable<ProductItem["config"]>["feature_override"]
>;

const creditsItem = (featureOverride?: Override): AddItem => ({
	feature_id: "credits",
	included: 100,
	reset: { interval: "month" },
	...(featureOverride ? { feature_override: featureOverride } : {}),
});

const flatOverride = (gateway: number): Override => ({
	credit_schema: [
		{ metered_feature_id: "gateway", credit_cost: gateway },
		{ metered_feature_id: "searches", credit_cost: 5 },
	],
});

const catalogPlan = (featureOverride?: CatalogOverride) => ({
	id: "pro",
	version: 1,
	items: [
		{
			feature_id: "credits",
			included_usage: 100,
			interval: "month",
			config: featureOverride ? { feature_override: featureOverride } : null,
		} as ProductItem,
	],
});

const updateOp = (item: AddItem, paired = true): UpdatePlanOp =>
	({
		type: "update_plan",
		plan_filter: { plan_id: "pro", version: 1, custom: false },
		customize: {
			add_items: [item],
			...(paired
				? {
						remove_items: [
							{
								feature_id: "credits",
								interval: "month",
								interval_count: 1,
								included: 100,
							},
						],
					}
				: {}),
		},
	}) as UpdatePlanOp;

const lines = ({
	item,
	previous,
	paired = true,
}: {
	item: AddItem;
	previous?: CatalogOverride;
	paired?: boolean;
}) =>
	addItemRateChanges({
		item,
		op: updateOp(item, paired),
		products: [catalogPlan(previous)],
		features,
	}).map((change) => `${change.label}: ${rateChangeText(change)}`);

describe("addItemRateChanges", () => {
	test("an override-only change reads old → new per changed metered feature", () => {
		expect(
			lines({
				item: creditsItem(flatOverride(3.571)),
				previous: {
					schema: [
						{ metered_feature_id: "gateway", credit_amount: 2.857 },
						{ metered_feature_id: "searches", credit_amount: 5 },
					],
				},
			}),
		).toEqual(["Gateway spend (USD): 2.857 → 3.571 credits"]);
	});

	test("an unchanged override adds nothing", () => {
		expect(
			lines({
				item: creditsItem(flatOverride(2)),
				previous: {
					schema: [
						{ metered_feature_id: "searches", credit_amount: 5 },
						{ metered_feature_id: "gateway", credit_amount: 2 },
					],
				},
			}),
		).toEqual([]);
	});

	test("an added item with an override shows its full rate card", () => {
		expect(
			lines({ item: creditsItem(flatOverride(3)), paired: false }),
		).toEqual(["Gateway spend (USD): 3 credits", "Searches: 5 credits"]);
	});

	test("a removed override falls back to the credit system's rates", () => {
		expect(
			lines({
				item: creditsItem(),
				previous: {
					schema: [{ metered_feature_id: "gateway", credit_amount: 4 }],
				},
			}),
		).toEqual(["Gateway spend (USD): 4 → 1 credits", "Searches: 5 credits"]);
	});

	test("a tiered rate whose range is unchanged spells out its tiers", () => {
		const tiered = (top: number): Override => ({
			credit_schema: [
				{
					metered_feature_id: "gateway",
					tier_behavior: "graduated",
					tiers: [
						{ to: top, credit_cost: 2 },
						{ to: "inf", credit_cost: 1 },
					],
				},
				{ metered_feature_id: "searches", credit_cost: 5 },
			],
		});
		expect(
			lines({
				item: creditsItem(tiered(5000)),
				previous: {
					schema: [
						{
							metered_feature_id: "gateway",
							tier_behavior: "graduated",
							tiers: [
								{ to: 1000, credit_amount: 2 },
								{ to: "inf", credit_amount: 1 },
							],
						},
						{ metered_feature_id: "searches", credit_amount: 5 },
					],
				},
			}),
		).toEqual([
			"Gateway spend (USD): 2 credits up to 1,000 · 1 above (tiered) → 2 credits up to 5,000 · 1 above (tiered)",
		]);
	});

	test("a markup change reads per markup level", () => {
		expect(
			lines({
				item: creditsItem({
					markups: {
						default_markup: 30,
						provider_markups: { openai: { markup: 10 } },
					},
				}),
				previous: { markups: { default_markup: 20 } },
			}),
		).toEqual(["Default: 20% → 30% markup", "openai: 10% markup"]);
	});

	test("a plan filter without one version shows the new rate card", () => {
		const item = creditsItem(flatOverride(3));
		const op = updateOp(item);
		expect(
			addItemRateChanges({
				item,
				op: { ...op, plan_filter: { plan_id: "pro" } },
				products: [catalogPlan()],
				features,
			}).map((change) => change.from),
		).toEqual([null, null]);
	});
});
