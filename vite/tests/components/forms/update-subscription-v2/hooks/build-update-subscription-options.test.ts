import { describe, expect, test } from "bun:test";
import { UsageModel } from "@autumn/shared";
import { buildUpdateSubscriptionOptions } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionRequestBody";

describe("buildUpdateSubscriptionOptions — billing_units handling", () => {
	test("should pass display quantities through, not multiply by billing_units", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 5000 },
		});

		expect(result).toEqual([{ feature_id: "messages", quantity: 5000 }]);
	});

	test("should not multiply or divide quantity by billing_units", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 5000 },
		});

		// Must NOT be 5,000,000 (5000 * 1000) or 5 (5000 / 1000)
		expect(result[0]?.quantity).toBe(5000);
	});

	test("should add included_usage to quantity", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 200 }],
			prepaidOptions: { messages: 5000 },
		});

		expect(result).toEqual([{ feature_id: "messages", quantity: 5200 }]);
	});

	test("should include existing prepaid quantities even when unchanged", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 1000 },
		});

		expect(result).toEqual([{ feature_id: "messages", quantity: 1000 }]);
	});

	test("should handle multiple features with different billing_units", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [
				{ feature_id: "messages", included_usage: 0 },
				{ feature_id: "tokens", included_usage: 100 },
			],
			prepaidOptions: { messages: 10000, tokens: 2500 },
		});

		expect(result).toEqual([
			{ feature_id: "messages", quantity: 10000 },
			{ feature_id: "tokens", quantity: 2600 },
		]);
	});

	test("should include new prepaid items from items array that are not in prepaidItems", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 5000, tokens: 3000 },
			items: [
				{
					feature_id: "tokens",
					usage_model: UsageModel.Prepaid,
					included_usage: 50,
				},
			],
		});

		expect(result).toEqual([
			{ feature_id: "messages", quantity: 5000 },
			{ feature_id: "tokens", quantity: 3050 },
		]);
	});

	test("should not duplicate items already in prepaidItems when also in items array", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 5000 },
			items: [
				{
					feature_id: "messages",
					usage_model: UsageModel.Prepaid,
					included_usage: 0,
				},
			],
		});

		expect(result).toEqual([{ feature_id: "messages", quantity: 5000 }]);
	});

	test("should skip quantities for features changed from prepaid to non-prepaid", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "ai_credits", included_usage: 0 }],
			prepaidOptions: { ai_credits: 200 },
			items: [
				{
					feature_id: "ai_credits",
					usage_model: undefined,
					included_usage: "inf",
				},
			],
		});

		expect(result).toEqual([]);
	});

	test("should skip non-prepaid items from items array", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [],
			prepaidOptions: { storage: 100 },
			items: [
				{
					feature_id: "storage",
					usage_model: UsageModel.PayPerUse,
					included_usage: 0,
				},
			],
		});

		expect(result).toEqual([]);
	});

	test("should return all existing quantities when no values changed", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [
				{ feature_id: "messages", included_usage: 0 },
				{ feature_id: "tokens", included_usage: 0 },
			],
			prepaidOptions: { messages: 1000, tokens: 500 },
		});

		expect(result).toEqual([
			{ feature_id: "messages", quantity: 1000 },
			{ feature_id: "tokens", quantity: 500 },
		]);
	});

	test("should handle included_usage as 'inf' by treating as 0", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: "inf" }],
			prepaidOptions: { messages: 5000 },
		});

		// typeof "inf" !== "number", so includedUsage defaults to 0
		expect(result).toEqual([{ feature_id: "messages", quantity: 5000 }]);
	});

	test("should use feature.internal_id as fallback when feature_id is null", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [
				{
					feature_id: null,
					feature: { internal_id: "int_messages" },
					included_usage: 0,
				},
			],
			prepaidOptions: { int_messages: 3000 },
		});

		expect(result).toEqual([{ feature_id: "int_messages", quantity: 3000 }]);
	});

	test("should preserve renamed prepaid quantities via internal feature identity", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [
				{
					feature_id: "messages_v2",
					feature: { internal_id: "int_messages" },
					included_usage: 100,
				},
			],
			prepaidOptions: { int_messages: 5000 },
		});

		expect(result).toEqual([{ feature_id: "messages_v2", quantity: 5100 }]);
	});
});
