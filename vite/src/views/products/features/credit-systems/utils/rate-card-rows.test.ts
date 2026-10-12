import { describe, expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type CreditSchemaItem,
	type CreditSchemaOverrideItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type PlanItemChangeV0,
} from "@autumn/shared";
import {
	creditRateLabel,
	previousRateText,
	rateCardRows,
	rateCardSubtitle,
	splitRateCardItemChanges,
} from "./rateCardRows";

const row = (metered_feature_id: string, credit_amount: number) =>
	({ metered_feature_id, credit_amount }) as CreditSchemaItem;
const excluded = (metered_feature_id: string) =>
	({ metered_feature_id, excluded: true }) as const;

const creditSystem = {
	id: "credits",
	name: "Demo credits",
	type: FeatureType.CreditSystem,
	config: {
		schema: [row("gateway", 3), row("image_gen", 1), row("search", 0.5)],
		usage_type: FeatureUsageType.Single,
	},
} as Feature;

const features = [
	creditSystem,
	{ id: "gateway", name: "Gateway spend", type: FeatureType.Metered },
	{ id: "image_gen", name: "Image generation", type: FeatureType.Metered },
	{
		id: "search",
		name: "Web search",
		type: FeatureType.Metered,
		display: { singular: "web search", plural: "web searches" },
	},
] as Feature[];

const statesOf = (override: CreditSchemaOverrideItem[]) =>
	rateCardRows({ override, creditSystem }).map(
		({ featureId, state }) => `${featureId}:${state}`,
	);

describe("rateCardRows", () => {
	test.each<{
		name: string;
		override: CreditSchemaOverrideItem[];
		states: string[];
	}>([
		{
			name: "no override inherits every catalog row",
			override: [],
			states: ["gateway:inherited", "image_gen:inherited", "search:inherited"],
		},
		{
			name: "changed, excluded in place, inherited, then added",
			override: [row("gateway", 2.857), excluded("image_gen"), row("video", 4)],
			states: [
				"gateway:changed",
				"image_gen:excluded",
				"search:inherited",
				"video:added",
			],
		},
		{
			name: "a row equal to the credit system's rate is inherited",
			override: [row("search", 0.5)],
			states: ["gateway:inherited", "image_gen:inherited", "search:inherited"],
		},
		{
			name: "excluding a feature the credit system lacks is ignored",
			override: [excluded("video")],
			states: ["gateway:inherited", "image_gen:inherited", "search:inherited"],
		},
	])("$name", ({ override, states }) => {
		expect(statesOf(override)).toEqual(states);
	});

	test("a changed row keeps the credit system's rate", () => {
		expect(
			rateCardRows({ override: [row("gateway", 2.857)], creditSystem })[0],
		).toEqual({
			featureId: "gateway",
			state: "changed",
			rate: row("gateway", 2.857),
			catalogRate: row("gateway", 3),
		});
	});
});

test.each<{ override: CreditSchemaOverrideItem[]; subtitle: string }>([
	{ override: [], subtitle: "From Demo credits" },
	{
		override: [row("gateway", 2.857), excluded("image_gen")],
		subtitle: "From Demo credits · 1 changed · 1 not covered",
	},
])("subtitle: $subtitle", ({ override, subtitle }) => {
	expect(
		rateCardSubtitle({
			creditSystemName: "Demo credits",
			rows: rateCardRows({ override, creditSystem }),
		}),
	).toBe(subtitle);
});

test.each<{ rate: CreditSchemaItem; label: string }>([
	{ rate: row("gateway", 2.857), label: "2.857 credits" },
	{
		rate: { ...row("search", 3), feature_amount: 10 },
		label: "3 credits per 10 web searches",
	},
])("creditRateLabel: $label", ({ rate, label }) => {
	expect(creditRateLabel({ rate, features })).toBe(label);
});

test.each([
	{ from: "3 credits", to: "2.857 credits", text: "3" },
	{ from: "1 credit", to: "2 credits", text: "1 credit" },
])("previousRateText: $from → $to", ({ from, to, text }) => {
	expect(previousRateText({ from, to })).toBe(text);
});

describe("splitRateCardItemChanges", () => {
	const item = (overrides: Partial<ApiPlanItemV1> = {}) =>
		({
			feature_id: "credits",
			included: 1000,
			unlimited: false,
			reset: { interval: "month" },
			price: null,
			...overrides,
		}) as ApiPlanItemV1;
	const change = (
		action: PlanItemChangeV0["action"],
		planItem: ApiPlanItemV1,
	): PlanItemChangeV0 => ({
		action,
		feature_id: planItem.feature_id,
		item: planItem,
	});
	const proposed = {
		feature_override: {
			credit_schema: [
				{ metered_feature_id: "gateway", credit_cost: 2.857 },
				{ metered_feature_id: "image_gen", excluded: true as const },
			],
		},
	};
	const proposedRates = [
		"Gateway spend: 3 credits → 2.857 credits",
		"Image generation: 1 credit → null",
	];
	const ratesOf = (itemChanges: PlanItemChangeV0[]) => {
		const { rateCardChanges, otherChanges } = splitRateCardItemChanges({
			itemChanges,
			features,
		});
		return {
			rates: rateCardChanges.flatMap(({ rates }) =>
				rates.map(({ label, from, to }) => `${label}: ${from} → ${to}`),
			),
			others: otherChanges.length,
		};
	};

	test.each<{
		name: string;
		created: ApiPlanItemV1;
		deleted: ApiPlanItemV1;
		expected: ReturnType<typeof ratesOf>;
	}>([
		{
			name: "a rate-card-only change lists each rate and hides the pair",
			created: item(proposed),
			deleted: item(),
			expected: { rates: proposedRates, others: 0 },
		},
		{
			name: "restoring a feature has no old rate",
			created: item(),
			deleted: item(proposed),
			expected: {
				rates: [
					"Gateway spend: 2.857 credits → 3 credits",
					"Image generation: null → 1 credit",
				],
				others: 0,
			},
		},
		{
			name: "server-assigned entitlement_id does not block the merge",
			created: item({ ...proposed, entitlement_id: "ent_new" }),
			deleted: item({ entitlement_id: "ent_old" }),
			expected: { rates: proposedRates, others: 0 },
		},
		{
			name: "a changed included amount stays an added and removed pair",
			created: item({ ...proposed, included: 2000 }),
			deleted: item(),
			expected: { rates: [], others: 2 },
		},
		{
			name: "unrelated items are left alone",
			created: item({ feature_id: "messages" }),
			deleted: item(),
			expected: { rates: [], others: 2 },
		},
	])("$name", ({ created, deleted, expected }) => {
		expect(
			ratesOf([change("created", created), change("deleted", deleted)]),
		).toEqual(expected);
	});
});
