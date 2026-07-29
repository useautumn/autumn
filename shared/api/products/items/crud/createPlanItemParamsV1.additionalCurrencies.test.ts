import { describe, expect, test } from "bun:test";
import { BasePriceParamsSchema } from "../../components/basePrice/basePrice.js";
import { CreatePlanItemParamsV1Schema } from "./createPlanItemParamsV1.js";

describe("CreatePlanItemParamsV1 additional_currencies", () => {
	test("preserves additional_currencies on a flat feature price", () => {
		const parsed = CreatePlanItemParamsV1Schema.parse({
			feature_id: "seats",
			price: {
				amount: 10,
				interval: "month",
				billing_method: "prepaid",
				additional_currencies: [{ currency: "eur", amount: 9 }],
			},
		});

		expect(parsed.price?.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
	});

	test("preserves per-tier additional_currencies on a tiered feature price", () => {
		const parsed = CreatePlanItemParamsV1Schema.parse({
			feature_id: "messages",
			price: {
				interval: "month",
				billing_method: "usage_based",
				tier_behavior: "graduated",
				tiers: [
					{
						to: 1000,
						amount: 0.5,
						additional_currencies: [{ currency: "eur", amount: 0.4 }],
					},
					{
						to: "inf",
						amount: 0.3,
						additional_currencies: [{ currency: "eur", amount: 0.25 }],
					},
				],
			},
		});

		expect(parsed.price?.tiers?.[0].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.4 },
		]);
		expect(parsed.price?.tiers?.[1].additional_currencies).toEqual([
			{ currency: "eur", amount: 0.25 },
		]);
	});

	test("rejects a currency present on some tiers but not all", () => {
		expect(() =>
			CreatePlanItemParamsV1Schema.parse({
				feature_id: "messages",
				price: {
					interval: "month",
					billing_method: "usage_based",
					tier_behavior: "graduated",
					tiers: [
						{
							to: 1000,
							amount: 0.5,
							additional_currencies: [{ currency: "eur", amount: 0.4 }],
						},
						{ to: "inf", amount: 0.3 },
					],
				},
			}),
		).toThrow();
	});

	test("rejects price.additional_currencies without a flat amount", () => {
		expect(() =>
			CreatePlanItemParamsV1Schema.parse({
				feature_id: "messages",
				price: {
					interval: "month",
					billing_method: "usage_based",
					tier_behavior: "graduated",
					tiers: [
						{ to: 1000, amount: 0.5 },
						{ to: "inf", amount: 0.3 },
					],
					additional_currencies: [{ currency: "eur", amount: 9 }],
				},
			}),
		).toThrow();
	});
});

describe("BasePriceParams additional_currencies", () => {
	test("preserves additional_currencies on the base price params", () => {
		const parsed = BasePriceParamsSchema.parse({
			amount: 10,
			interval: "month",
			additional_currencies: [{ currency: "eur", amount: 9 }],
		});

		expect(parsed.additional_currencies).toEqual([
			{ currency: "eur", amount: 9 },
		]);
	});
});
