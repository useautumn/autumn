import { expect, test } from "bun:test";
import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import {
	creditRateLabel,
	rateCardRows,
	rateCardSubtitle,
	rateChangeParts,
} from "./rateCardRows";

const row = (metered_feature_id: string, credit_amount: number) =>
	({ metered_feature_id, credit_amount }) as CreditSchemaItem;

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
	{ id: "video", name: "Video", type: FeatureType.Metered },
] as Feature[];

const statesOf = (override: Parameters<typeof rateCardRows>[0]["override"]) =>
	rateCardRows({ override, creditSystem }).rows.map(
		({ featureId, state }) => `${featureId}:${state}`,
	);

test("with no override every catalog row is inherited", () => {
	expect(statesOf([])).toEqual([
		"gateway:inherited",
		"image_gen:inherited",
		"search:inherited",
	]);
});

test("rows are changed, excluded in place, inherited, and added at the end", () => {
	expect(
		statesOf([
			row("gateway", 2.857),
			{ metered_feature_id: "image_gen", excluded: true },
			row("video", 4),
		]),
	).toEqual([
		"gateway:changed",
		"image_gen:excluded",
		"search:inherited",
		"video:added",
	]);
});

test("a changed row keeps the credit system's rate to show what it was", () => {
	const [gateway] = rateCardRows({
		override: [row("gateway", 2.857)],
		creditSystem,
	}).rows;
	expect(gateway).toEqual({
		featureId: "gateway",
		state: "changed",
		rate: row("gateway", 2.857),
		catalogRate: row("gateway", 3),
	});
});

test("an override row equal to the credit system's rate reads as inherited", () => {
	expect(statesOf([row("search", 0.5)])).toContain("search:inherited");
});

test("an excluded row for a feature the credit system lacks is ignored", () => {
	expect(statesOf([{ metered_feature_id: "video", excluded: true }])).toEqual([
		"gateway:inherited",
		"image_gen:inherited",
		"search:inherited",
	]);
});

test("the subtitle counts changes and skips zero counts", () => {
	const summary = rateCardRows({
		override: [
			row("gateway", 2.857),
			{ metered_feature_id: "image_gen", excluded: true },
		],
		creditSystem,
	});
	expect(rateCardSubtitle({ creditSystemName: "Demo credits", summary })).toBe(
		"From Demo credits · 1 changed · 1 not covered",
	);
	expect(
		rateCardSubtitle({
			creditSystemName: "Demo credits",
			summary: rateCardRows({ override: [], creditSystem }),
		}),
	).toBe("From Demo credits");
});

test("rate labels name the billing units when there are several", () => {
	expect(creditRateLabel({ rate: row("gateway", 2.857), features })).toBe(
		"2.857 credits",
	);
	expect(
		creditRateLabel({
			rate: { ...row("search", 3), feature_amount: 10 },
			features,
		}),
	).toBe("3 credits per 10 web searches");
});

test("a shared unit is written once, a different one keeps the full old rate", () => {
	expect(rateChangeParts({ from: "3 credits", to: "2.857 credits" })).toEqual({
		from: "3",
		to: "2.857 credits",
	});
	expect(rateChangeParts({ from: "1 credit", to: "2 credits" })).toEqual({
		from: "1 credit",
		to: "2 credits",
	});
});
