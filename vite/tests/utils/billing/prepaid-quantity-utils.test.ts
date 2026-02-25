import { describe, expect, test } from "bun:test";
import {
	getPrepaidDisplayQuantity,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import {
	backendToDisplayQuantity,
	convertPrepaidOptionsToFeatureOptions,
} from "@/utils/billing/prepaidQuantityUtils";

function makeProduct({ items }: { items: ProductV2["items"] }): ProductV2 {
	return {
		id: "prod_test",
		name: "Test Product",
		is_add_on: false,
		is_default: false,
		version: 1,
		group: null,
		env: "sandbox" as any,
		items,
		created_at: Date.now(),
	};
}

describe("backendToDisplayQuantity", () => {
	test("should multiply backend quantity by billing_units", () => {
		const result = backendToDisplayQuantity({
			backendOptions: [{ feature_id: "messages", quantity: 1 }],
			prepaidItems: [{ feature_id: "messages", billing_units: 1000 }],
		});

		expect(result).toEqual({ messages: 1000 });
	});

	test("should handle multiple features with different billing_units", () => {
		const result = backendToDisplayQuantity({
			backendOptions: [
				{ feature_id: "messages", quantity: 10 },
				{ feature_id: "tokens", quantity: 5 },
			],
			prepaidItems: [
				{ feature_id: "messages", billing_units: 1000 },
				{ feature_id: "tokens", billing_units: 500 },
			],
		});

		expect(result).toEqual({ messages: 10000, tokens: 2500 });
	});

	test("should default to billing_units=1 when nullish", () => {
		const result = backendToDisplayQuantity({
			backendOptions: [{ feature_id: "messages", quantity: 5 }],
			prepaidItems: [{ feature_id: "messages", billing_units: null }],
		});

		expect(result).toEqual({ messages: 5 });
	});

	test("should default to 0 when feature has no backend option", () => {
		const result = backendToDisplayQuantity({
			backendOptions: [],
			prepaidItems: [{ feature_id: "messages", billing_units: 1000 }],
		});

		expect(result).toEqual({ messages: 0 });
	});

	test("should ignore backend options not in prepaidItems", () => {
		const result = backendToDisplayQuantity({
			backendOptions: [
				{ feature_id: "messages", quantity: 10 },
				{ feature_id: "unknown", quantity: 99 },
			],
			prepaidItems: [{ feature_id: "messages", billing_units: 1000 }],
		});

		expect(result).toEqual({ messages: 10000 });
	});

	test("should return empty record when no prepaid items", () => {
		const result = backendToDisplayQuantity({
			backendOptions: [{ feature_id: "messages", quantity: 10 }],
			prepaidItems: [],
		});

		expect(result).toEqual({});
	});
});

describe("convertPrepaidOptionsToFeatureOptions", () => {
	test("should pass quantity through as-is for prepaid items (inclusive of billing units)", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "feat_credits",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: { feat_credits: 10000 },
			product,
		});

		expect(result).toEqual([{ feature_id: "feat_credits", quantity: 10000 }]);
	});

	test("should not multiply quantity by billing_units", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "feat_credits",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: { feat_credits: 5000 },
			product,
		});

		// Must NOT be 5,000,000 (5000 * 1000)
		expect(result).toEqual([{ feature_id: "feat_credits", quantity: 5000 }]);
	});

	test("should not divide quantity by billing_units", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "feat_credits",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: { feat_credits: 5000 },
			product,
		});

		// Must NOT be 5 (5000 / 1000)
		expect(result).toEqual([{ feature_id: "feat_credits", quantity: 5000 }]);
	});

	test("should pass quantity through for non-prepaid items", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "feat_storage",
					usage_model: UsageModel.PayPerUse,
					billing_units: 1000,
				},
			],
		});

		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: { feat_storage: 5000 },
			product,
		});

		expect(result).toEqual([{ feature_id: "feat_storage", quantity: 5000 }]);
	});

	test("should handle multiple features with different billing_units", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "feat_credits",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
				{
					feature_id: "feat_tokens",
					usage_model: UsageModel.Prepaid,
					billing_units: 500,
				},
			],
		});

		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: {
				feat_credits: 10000,
				feat_tokens: 2500,
			},
			product,
		});

		expect(result).toEqual([
			{ feature_id: "feat_credits", quantity: 10000 },
			{ feature_id: "feat_tokens", quantity: 2500 },
		]);
	});

	test("should return undefined when product is undefined", () => {
		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: { feat_credits: 10000 },
			product: undefined,
		});

		expect(result).toBeUndefined();
	});

	test("should return undefined when prepaidOptions is empty", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "feat_credits",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: {},
			product,
		});

		expect(result).toBeUndefined();
	});

	test("should handle zero quantity", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "feat_credits",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = convertPrepaidOptionsToFeatureOptions({
			prepaidOptions: { feat_credits: 0 },
			product,
		});

		expect(result).toEqual([{ feature_id: "feat_credits", quantity: 0 }]);
	});
});

describe("getPrepaidDisplayQuantity", () => {
	test("should multiply quantity by billingUnits", () => {
		const result = getPrepaidDisplayQuantity({
			quantity: 1,
			billingUnits: 1000,
		});
		expect(result).toBe(1000);
	});

	test("should handle larger pack counts", () => {
		const result = getPrepaidDisplayQuantity({
			quantity: 5,
			billingUnits: 1000,
		});
		expect(result).toBe(5000);
	});

	test("should default to billingUnits=1 when null", () => {
		const result = getPrepaidDisplayQuantity({
			quantity: 7,
			billingUnits: null,
		});
		expect(result).toBe(7);
	});

	test("should default to billingUnits=1 when undefined", () => {
		const result = getPrepaidDisplayQuantity({
			quantity: 7,
			billingUnits: undefined,
		});
		expect(result).toBe(7);
	});

	test("should return 0 when quantity is 0", () => {
		const result = getPrepaidDisplayQuantity({
			quantity: 0,
			billingUnits: 1000,
		});
		expect(result).toBe(0);
	});

	test("should be identity when billingUnits is 1", () => {
		const result = getPrepaidDisplayQuantity({
			quantity: 42,
			billingUnits: 1,
		});
		expect(result).toBe(42);
	});
});
