/**
 * The generation context is what the model can copy back into an add_items
 * entry. A field the context drops is a setting the generated request deletes,
 * so every identity-bearing field of a plan item must survive compaction.
 */

import { describe, expect, test } from "bun:test";
import type { ApiPlanItemV1 } from "@autumn/shared";
import {
	BillingInterval,
	BillingMethod,
	itemsEqual,
	ResetInterval,
	RolloverExpiryDurationType,
	toCreatePlanItemParams,
} from "@autumn/shared";

const dimensionedCreditsItem = {
	feature_id: "credits",
	included: 10_000,
	pooled: true,
	reset: { interval: ResetInterval.Month },
	rollover: {
		expiry_duration_type: RolloverExpiryDurationType.Month,
		expiry_duration_length: 1,
		max: 5_000,
		max_percentage: null,
	},
	feature_override: {
		credit_schema: [
			{
				metered_feature_id: "action1",
				credit_cost: 1,
				dimensions: {
					large: { match: { size: "large" }, credit_amount: 16 },
				},
			},
		],
	},
} as unknown as ApiPlanItemV1;

describe("toCreatePlanItemParams", () => {
	test("carries the pooled, rollover and reset identity fields", () => {
		const params = toCreatePlanItemParams(dimensionedCreditsItem);

		expect(params.pooled).toBe(true);
		expect(params.included).toBe(10_000);
		expect(params.reset).toEqual({ interval: ResetInterval.Month });
		expect(params.rollover).toMatchObject({ max: 5_000 });
	});

	test("carries feature_override so a credit schema survives a remove+add", () => {
		const params = toCreatePlanItemParams(dimensionedCreditsItem);

		expect(params.feature_override).toEqual(
			dimensionedCreditsItem.feature_override,
		);
	});

	test("omits feature_override when the item has none", () => {
		const params = toCreatePlanItemParams({
			feature_id: "messages",
			included: 100,
			reset: { interval: ResetInterval.Month },
		} as unknown as ApiPlanItemV1);

		expect("feature_override" in params).toBe(false);
	});

	test("carries a priced item's price through unchanged", () => {
		const params = toCreatePlanItemParams({
			feature_id: "credits",
			included: 0,
			price: {
				amount: 0.01,
				billing_method: BillingMethod.UsageBased,
				billing_units: 1,
				interval: BillingInterval.Month,
			},
		} as unknown as ApiPlanItemV1);

		expect(params.price).toMatchObject({ amount: 0.01 });
	});
});

describe("itemsEqual feature_override", () => {
	const item = (override?: Record<string, unknown>) =>
		({
			feature_id: "credits",
			included: 100,
			reset: { interval: ResetInterval.Month },
			...(override ? { feature_override: override } : {}),
		}) as unknown as ApiPlanItemV1;

	const dimensioned = {
		credit_schema: [
			{
				metered_feature_id: "action1",
				credit_cost: 1,
				dimensions: { large: { match: { size: "large" }, credit_cost: 16 } },
			},
		],
	};

	test("an override-only change makes two items differ", () => {
		expect(itemsEqual(item(dimensioned), item())).toBe(false);
	});

	test("a changed dimension rate makes two items differ", () => {
		const cheaper = {
			credit_schema: [
				{
					metered_feature_id: "action1",
					credit_cost: 1,
					dimensions: { large: { match: { size: "large" }, credit_cost: 8 } },
				},
			],
		};
		expect(itemsEqual(item(dimensioned), item(cheaper))).toBe(false);
	});

	test("the same override compares equal regardless of key order", () => {
		const reordered = {
			credit_schema: [
				{
					dimensions: { large: { credit_cost: 16, match: { size: "large" } } },
					credit_cost: 1,
					metered_feature_id: "action1",
				},
			],
		};
		expect(itemsEqual(item(dimensioned), item(reordered))).toBe(true);
	});

	test("two items with no override are still equal", () => {
		expect(itemsEqual(item(), item())).toBe(true);
	});
});
