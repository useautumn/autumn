import { expect, test } from "bun:test";
import {
	type ApiPlanItemV1,
	type CreditSchemaItem,
	type CreditSchemaOverrideItem,
	type Feature,
	FeatureType,
} from "@autumn/shared";
import {
	addableFeatures,
	rateCardItemChanges,
	rateCardRows,
} from "./rateCardRows";

const rate = (metered_feature_id: string, credit_amount: number) =>
	({ metered_feature_id, credit_amount }) as CreditSchemaItem;
const excluded = (metered_feature_id: string) =>
	({ metered_feature_id, excluded: true }) as const;
const creditSystem = {
	id: "credits",
	type: FeatureType.CreditSystem,
	config: { schema: [rate("a", 3), rate("b", 1), rate("c", 0.5)] },
} as Feature;
const statesOf = (override: CreditSchemaOverrideItem[]) =>
	rateCardRows({ override, catalog: creditSystem.config.schema }).map(
		(r) => `${r.featureId}:${r.state}`,
	);

test.each<[CreditSchemaOverrideItem[], string]>([
	[[], "a:inherited b:inherited c:inherited"],
	[
		[rate("a", 2), excluded("b"), rate("d", 4)],
		"a:changed b:excluded c:inherited d:added",
	],
	[[rate("c", 0.5), excluded("d")], "a:inherited b:inherited c:inherited"],
])("rateCardRows %#", (override, states) => {
	expect(statesOf(override).join(" ")).toBe(states);
});

const candidates = ["a", "b", "c", "d", "e"].map((id) => ({ id }) as Feature);

test.each<[CreditSchemaOverrideItem[], string]>([
	[[], "d e"],
	[[excluded("b"), rate("d", 4)], "e"],
	[[rate("d", 4), rate("e", 1)], ""],
])(
	"addableFeatures skips every rate card row, excluded ones included %#",
	(override, ids) => {
		const rows = rateCardRows({
			override,
			catalog: creditSystem.config.schema,
		});
		expect(
			addableFeatures({ features: candidates, rows })
				.map((f) => f.id)
				.join(" "),
		).toBe(ids);
	},
);

const item = (credit_schema?: object[], included = 1000) =>
	({
		feature_id: "credits",
		included,
		reset: { interval: "month" },
		...(credit_schema ? { feature_override: { credit_schema } } : {}),
	}) as ApiPlanItemV1;
const proposed = [{ metered_feature_id: "a", credit_cost: 2 }, excluded("b")];
const tiers = (cost: number) => [
	{
		metered_feature_id: "a",
		tier_behavior: "graduated",
		tiers: [
			{ to: 10, credit_cost: 1 },
			{ to: "inf", credit_cost: cost },
		],
	},
];

test.each<[ApiPlanItemV1, ApiPlanItemV1, string | null]>([
	[item(proposed), item(), "a:changed b:excluded"],
	[item(), item(proposed), "a:changed b:added"],
	[item(proposed, 2000), item(), null],
	[item(tiers(2)), item(tiers(1)), null],
])("rateCardItemChanges %#", (created, deleted, expected) => {
	const { rateCardChanges, otherChanges } = rateCardItemChanges({
		itemChanges: [
			{
				action: "created",
				feature_id: "credits",
				item: { ...created, entitlement_id: "x" },
			},
			{
				action: "deleted",
				feature_id: "credits",
				item: { ...deleted, entitlement_id: "y" },
			},
		],
		features: [creditSystem],
	});
	const rows = rateCardChanges[0]?.rows.map((r) => `${r.featureId}:${r.state}`);
	expect(rows ? rows.join(" ") : null).toEqual(expected as string);
	expect(otherChanges).toHaveLength(expected ? 0 : 2);
});
