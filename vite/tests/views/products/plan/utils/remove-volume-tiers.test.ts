import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type Feature,
	FeatureType,
	FeatureUsageType,
	getProductItemDisplay,
	Infinite,
	type PriceTier,
	type ProductItem,
	ProductItemInterval,
	TierBehavior,
	UsageModel,
} from "@autumn/shared";
import { showsThresholdBilling } from "@/views/products/plan/components/edit-plan-feature/advanced-settings/thresholdBillingItem";
import { removeTier } from "@/views/products/plan/utils/tierUtils";

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

const volumeItem = (tiers: PriceTier[]): ProductItem =>
	({
		feature_id: "messages",
		included_usage: 100,
		interval: ProductItemInterval.Month,
		usage_model: UsageModel.PayPerUse,
		billing_units: 1,
		tier_behavior: TierBehavior.VolumeBased,
		tiers,
	}) as ProductItem;

const removeDownToOne = (item: ProductItem): ProductItem => {
	let current = item;
	while ((current.tiers?.length ?? 0) > 1) {
		removeTier({
			item: current,
			index: 0,
			setItem: (next) => {
				current = next;
			},
		});
	}
	return current;
};

const display = (item: ProductItem) =>
	getProductItemDisplay({ item, features: [messages], currency: "usd" });

describe("removing a volume item's tiers down to one", () => {
	const threeTiers = volumeItem([
		{ to: 500, amount: 0.1, flat_amount: 5 },
		{ to: 2000, amount: 0.08, flat_amount: 10 },
		{ to: Infinite, amount: 0.05, flat_amount: 20 },
	]);

	test("shows the volume rule while tiered", () => {
		expect(display(threeTiers).secondary_text).toContain("volume:");
	});

	test("becomes the plain price the save will send", () => {
		const single = removeDownToOne(threeTiers);
		expect(single.tier_behavior).toBeUndefined();
		expect(single.tiers).toEqual([
			{
				to: Infinite,
				amount: 0.05,
				flat_amount: undefined,
				additional_currencies: undefined,
			},
		]);
		expect(display(single)).toEqual({
			primary_text: "100 messages",
			secondary_text: "then $0.05 per message",
		});
	});

	test("threshold billing is offered for the plain price", () => {
		expect(showsThresholdBilling({ item: removeDownToOne(threeTiers) })).toBe(
			true,
		);
	});

	test("a flat-only tier keeps its fee as the per-unit amount", () => {
		const single = removeDownToOne(
			volumeItem([
				{ to: 500, amount: 0, flat_amount: 5 },
				{ to: Infinite, amount: 0, flat_amount: 20 },
			]),
		);
		expect(single.tiers?.[0]).toMatchObject({ amount: 20 });
		expect(single.tiers?.[0].flat_amount).toBeUndefined();
	});
});
