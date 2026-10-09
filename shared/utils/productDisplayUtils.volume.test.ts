import { describe, expect, test } from "bun:test";
import {
	FeatureType,
	FeatureUsageType,
} from "@models/featureModels/featureEnums";
import type { Feature } from "@models/featureModels/featureModels";
import { AppEnv } from "@models/genModels/genEnums";
import { ProductItemInterval } from "@models/productModels/intervals/productItemInterval";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import {
	type ProductItem,
	UsageModel,
} from "@models/productV2Models/productItemModels/productItemModels";
import { getProductItemDisplay } from "./productDisplayUtils";

const messages: Feature = {
	internal_id: "fe_messages",
	org_id: "org_1",
	created_at: 1,
	env: AppEnv.Sandbox,
	id: "messages",
	name: "Messages",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
	display: { singular: "message", plural: "messages" },
	archived: false,
	event_names: [],
};

const tieredItem = ({
	tierBehavior,
	includedUsage = 0,
	tiers = [
		{ to: 100, amount: 1 },
		{ to: "inf", amount: 0.5 },
	],
}: {
	tierBehavior: TierBehavior;
	includedUsage?: number;
	tiers?: ProductItem["tiers"];
}): ProductItem =>
	({
		feature_id: "messages",
		included_usage: includedUsage,
		interval: ProductItemInterval.Month,
		usage_model: UsageModel.PayPerUse,
		billing_units: 1,
		tier_behavior: tierBehavior,
		tiers,
	}) as ProductItem;

const display = (item: ProductItem) =>
	getProductItemDisplay({ item, features: [messages], currency: "usd" });

describe("getProductItemDisplay: volume tiers", () => {
	test("graduated tiers read as before", () => {
		expect(
			display(tieredItem({ tierBehavior: TierBehavior.Graduated })),
		).toEqual({
			primary_text: "$1 - $0.5 per message",
			secondary_text: undefined,
		});
	});

	test("volume tiers say volume and the rate rule", () => {
		expect(
			display(tieredItem({ tierBehavior: TierBehavior.VolumeBased })),
		).toEqual({
			primary_text:
				"$1 - $0.5 per message (volume: all units at the reached tier's rate)",
			secondary_text: undefined,
		});
	});

	test("volume tiers with included usage name the threshold", () => {
		expect(
			display(
				tieredItem({
					tierBehavior: TierBehavior.VolumeBased,
					includedUsage: 100,
				}),
			),
		).toEqual({
			primary_text: "100 messages",
			secondary_text:
				"then $1 - $0.5 per message (volume: past 100, all units at the reached tier's rate)",
		});
	});

	test("mixed tiers show per-unit rates, not flat fees", () => {
		const item = tieredItem({
			tierBehavior: TierBehavior.VolumeBased,
			tiers: [
				{ to: 100, amount: 1, flat_amount: 5 },
				{ to: "inf", amount: 0.5, flat_amount: 20 },
			],
		});
		expect(display(item).primary_text).toBe(
			"$1 - $0.5 per message (volume: all units at the reached tier's rate plus its flat fee)",
		);
	});

	test("flat-only tiers show the flat fee range", () => {
		const item = tieredItem({
			tierBehavior: TierBehavior.VolumeBased,
			tiers: [
				{ to: 100, amount: 0, flat_amount: 5 },
				{ to: "inf", amount: 0, flat_amount: 20 },
			],
		});
		expect(display(item).primary_text).toBe(
			"$5 - $20 for messages (volume: the reached tier's flat fee)",
		);
	});

	test("single-tier volume with included usage shows the rule", () => {
		const item = tieredItem({
			tierBehavior: TierBehavior.VolumeBased,
			includedUsage: 100,
			tiers: [{ to: "inf", amount: 0.5 }],
		});
		expect(display(item)).toEqual({
			primary_text: "100 messages",
			secondary_text:
				"then $0.5 per message (volume: past 100, all units at the reached tier's rate)",
		});
	});

	test("single-tier volume with nothing included shows no rule", () => {
		const item = tieredItem({
			tierBehavior: TierBehavior.VolumeBased,
			tiers: [{ to: "inf", amount: 0.5 }],
		});
		expect(display(item)).toEqual({
			primary_text: "$0.5 per message",
			secondary_text: undefined,
		});
	});
});
