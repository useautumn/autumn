import { describe, expect, test } from "bun:test";
import type { ProductItem, ProductV2 } from "@autumn/shared";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { productV2ToApiPlanV1 } from "../productV2ToApiPlanV1.js";
import { itemsAreSame } from "./compareItemUtils.js";

const same = (item1: ProductItem, item2: ProductItem) =>
	itemsAreSame({ item1, item2 }).same;

describe("itemsAreSame — dialect round-trip normalization", () => {
	test("reset_usage_when_enabled undefined equals false", () => {
		const sparse = {
			feature_id: "approval_chains",
			feature_type: "static",
		} as unknown as ProductItem;
		const roundTripped = {
			feature_id: "approval_chains",
			feature_type: "static",
			included_usage: 0,
			interval: null,
			pooled: false,
			reset_usage_when_enabled: false,
		} as unknown as ProductItem;
		expect(same(sparse, roundTripped)).toBe(true);
	});

	test("a flat per-unit price equals its single-tier form", () => {
		const tiered = {
			feature_id: "credits",
			usage_model: "pay_per_use",
			interval: "month",
			billing_units: 1,
			tiers: [{ amount: 0.1, to: "inf", flat_amount: null }],
		} as unknown as ProductItem;
		const flat = {
			feature_id: "credits",
			usage_model: "pay_per_use",
			interval: "month",
			billing_units: 1,
			included_usage: 0,
			price: 0.1,
			reset_usage_when_enabled: false,
		} as unknown as ProductItem;
		expect(same(tiered, flat)).toBe(true);
	});

	test("a flat price still differs from a different single tier", () => {
		const tiered = {
			feature_id: "credits",
			usage_model: "pay_per_use",
			interval: "month",
			tiers: [{ amount: 0.2, to: "inf" }],
		} as unknown as ProductItem;
		const flat = {
			feature_id: "credits",
			usage_model: "pay_per_use",
			interval: "month",
			price: 0.1,
		} as unknown as ProductItem;
		expect(same(tiered, flat)).toBe(false);
	});

	test("default proration config equals an absent one", () => {
		const explicit = {
			feature_id: "credits",
			usage_model: "prepaid",
			interval: "month",
			price: 10,
			config: { on_increase: "prorate_immediately", on_decrease: "prorate" },
		} as unknown as ProductItem;
		const absent = {
			feature_id: "credits",
			usage_model: "prepaid",
			interval: "month",
			price: 10,
		} as unknown as ProductItem;
		expect(same(explicit, absent)).toBe(true);
	});

	test("non-default proration config differs from an absent one", () => {
		const explicit = {
			feature_id: "credits",
			usage_model: "prepaid",
			interval: "month",
			price: 10,
			config: { on_increase: "bill_immediately", on_decrease: "prorate" },
		} as unknown as ProductItem;
		const absent = {
			feature_id: "credits",
			usage_model: "prepaid",
			interval: "month",
			price: 10,
		} as unknown as ProductItem;
		expect(same(explicit, absent)).toBe(false);
	});

	test("rollover max null equals undefined", () => {
		const withNull = {
			feature_id: "credits",
			included_usage: 1000,
			interval: "month",
			config: {
				rollover: {
					duration: "month",
					length: 1,
					max: null,
					max_percentage: 50,
				},
			},
		} as unknown as ProductItem;
		const withUndefined = {
			feature_id: "credits",
			included_usage: 1000,
			interval: "month",
			config: {
				rollover: { duration: "month", length: 1, max_percentage: 50 },
			},
		} as unknown as ProductItem;
		expect(same(withNull, withUndefined)).toBe(true);
	});
});

describe("productV2ToApiPlanV1 — proration fidelity", () => {
	const features = [
		{
			id: "credits",
			name: "Credits",
			type: "credit_system",
			config: { usage_type: "single_use" },
		},
	] as unknown as Feature[];
	const product = {
		id: "scale",
		name: "Scale",
		env: "sandbox",
		items: [
			{
				type: "priced_feature",
				feature_id: "credits",
				feature_type: "single_use",
				included_usage: 1000,
				interval: "month",
				usage_model: "prepaid",
				billing_units: 1,
				tier_behavior: "volume",
				tiers: [
					{ to: 2000, amount: 0, flat_amount: 200 },
					{ to: "inf", amount: 0, flat_amount: 600 },
				],
				config: {
					on_increase: "prorate_immediately",
					on_decrease: "prorate_immediately",
				},
			},
		],
	} as unknown as ProductV2;

	test("plan responses keep stripping proration", () => {
		const plan = productV2ToApiPlanV1({ features, product });
		expect(plan.items[0]?.proration).toBeUndefined();
	});

	test("diff and patch bases keep proration with includeProration", () => {
		const plan = productV2ToApiPlanV1({
			features,
			includeProration: true,
			product,
		});
		expect(plan.items[0]?.proration).toEqual({
			on_increase: "prorate_immediately",
			on_decrease: "prorate_immediately",
		});
	});
});
