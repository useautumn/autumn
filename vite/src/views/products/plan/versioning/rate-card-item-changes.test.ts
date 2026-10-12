import { expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type PlanItemChangeV0,
} from "@autumn/shared";
import { splitRateCardItemChanges } from "./rateCardItemChanges";

const row = (metered_feature_id: string, credit_amount: number) =>
	({ metered_feature_id, credit_amount }) as CreditSchemaItem;

const features = [
	{
		id: "credits",
		name: "Demo credits",
		type: FeatureType.CreditSystem,
		config: {
			schema: [row("gateway", 3), row("image_gen", 1), row("search", 0.5)],
			usage_type: FeatureUsageType.Single,
		},
	},
	{ id: "gateway", name: "Gateway spend", type: FeatureType.Metered },
	{ id: "image_gen", name: "Image generation", type: FeatureType.Metered },
	{ id: "search", name: "Web search", type: FeatureType.Metered },
	{ id: "messages", name: "Messages", type: FeatureType.Metered },
] as Feature[];

type ApiOverride = NonNullable<ApiPlanItemV1["feature_override"]>;

const item = ({
	featureId = "credits",
	included = 1000,
	override,
}: {
	featureId?: string;
	included?: number;
	override?: ApiOverride;
}) =>
	({
		feature_id: featureId,
		included,
		unlimited: false,
		reset: { interval: "month" },
		price: null,
		...(override ? { feature_override: override } : {}),
	}) as ApiPlanItemV1;

const change = (
	action: PlanItemChangeV0["action"],
	planItem: ApiPlanItemV1,
): PlanItemChangeV0 => ({
	action,
	feature_id: planItem.feature_id,
	item: planItem,
});

const proposedOverride: ApiOverride = {
	credit_schema: [
		{ metered_feature_id: "gateway", credit_cost: 2.857 },
		{ metered_feature_id: "image_gen", excluded: true },
	],
};

test("an item whose rate card alone changed becomes one change listing each rate", () => {
	const created = change("created", item({ override: proposedOverride }));
	const { rateCardChanges, otherChanges } = splitRateCardItemChanges({
		itemChanges: [created, change("deleted", item({}))],
		features,
	});

	expect(otherChanges).toEqual([]);
	expect(rateCardChanges).toEqual([
		{
			change: created,
			rates: [
				{
					featureId: "gateway",
					label: "Gateway spend",
					from: "3 credits",
					to: "2.857 credits",
				},
				{
					featureId: "image_gen",
					label: "Image generation",
					from: "1 credit",
					to: null,
				},
			],
		},
	]);
});

test("restoring a feature lists it with no old rate", () => {
	const { rateCardChanges } = splitRateCardItemChanges({
		itemChanges: [
			change("created", item({})),
			change("deleted", item({ override: proposedOverride })),
		],
		features,
	});

	expect(rateCardChanges[0]?.rates.map(({ from, to }) => [from, to])).toEqual([
		["2.857 credits", "3 credits"],
		[null, "1 credit"],
	]);
});

test("server-assigned fields like entitlement_id do not block the merge", () => {
	const { rateCardChanges } = splitRateCardItemChanges({
		itemChanges: [
			change("created", {
				...item({ override: proposedOverride }),
				entitlement_id: "ent_new",
			} as ApiPlanItemV1),
			change("deleted", {
				...item({}),
				entitlement_id: "ent_old",
			} as ApiPlanItemV1),
		],
		features,
	});
	expect(rateCardChanges).toHaveLength(1);
});

test("an item whose included amount also changed stays an added and removed pair", () => {
	const itemChanges = [
		change("created", item({ included: 2000, override: proposedOverride })),
		change("deleted", item({})),
	];
	expect(splitRateCardItemChanges({ itemChanges, features })).toEqual({
		rateCardChanges: [],
		otherChanges: itemChanges,
	});
});

test("unrelated added and removed items are left alone", () => {
	const itemChanges = [
		change("created", item({ featureId: "messages" })),
		change("deleted", item({})),
	];
	expect(
		splitRateCardItemChanges({ itemChanges, features }).otherChanges,
	).toEqual(itemChanges);
});
