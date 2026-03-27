import { describe, expect, test } from "bun:test";
import { buildUpdateSubscriptionOptions } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionRequestBody";

describe("buildUpdateSubscriptionOptions — included usage handling", () => {
	test("should pass display quantities through, not multiply by billing_units", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 5000 },
			initialPrepaidOptions: { messages: 1000 },
			initialBackendQuantities: { messages: 1000 },
		});

		expect(result).toEqual([{ feature_id: "messages", quantity: 5000 }]);
	});

	test("should not multiply or divide quantity by billing_units", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 5000 },
			initialPrepaidOptions: { messages: 1000 },
			initialBackendQuantities: { messages: 1000 },
		});

		// Must NOT be 5,000,000 (5000 * 1000) or 5 (5000 / 1000)
		expect(result[0]?.quantity).toBe(5000);
	});

	test("should pass inclusive quantities through unchanged", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 200 }],
			prepaidOptions: { messages: 5000 },
			initialPrepaidOptions: { messages: 1000 },
			initialBackendQuantities: { messages: 800 },
		});

		expect(result).toEqual([{ feature_id: "messages", quantity: 5000 }]);
	});

	test("should skip unchanged inclusive quantities", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "AI_CREDITS", included_usage: 250 }],
			prepaidOptions: { AI_CREDITS: 750 },
			initialPrepaidOptions: { AI_CREDITS: 750 },
			initialBackendQuantities: { AI_CREDITS: 500 },
		});

		expect(result).toEqual([]);
	});

	test("should serialize inclusive 750 as 750", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "AI_CREDITS", included_usage: 250 }],
			prepaidOptions: { AI_CREDITS: 750 },
			initialPrepaidOptions: { AI_CREDITS: 500 },
			initialBackendQuantities: { AI_CREDITS: 250 },
		});

		expect(result).toEqual([{ feature_id: "AI_CREDITS", quantity: 750 }]);
	});

	test("should serialize inclusive 1000 as 1000", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "AI_CREDITS", included_usage: 250 }],
			prepaidOptions: { AI_CREDITS: 1000 },
			initialPrepaidOptions: { AI_CREDITS: 750 },
			initialBackendQuantities: { AI_CREDITS: 500 },
		});

		expect(result).toEqual([{ feature_id: "AI_CREDITS", quantity: 1000 }]);
	});

	test("should skip items where quantity has not changed", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 0 }],
			prepaidOptions: { messages: 1000 },
			initialPrepaidOptions: { messages: 1000 },
			initialBackendQuantities: { messages: 1000 },
		});

		expect(result).toEqual([]);
	});

	test("should handle multiple features with different billing_units", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [
				{ feature_id: "messages", included_usage: 0 },
				{ feature_id: "tokens", included_usage: 100 },
			],
			prepaidOptions: { messages: 10000, tokens: 2500 },
			initialPrepaidOptions: { messages: 5000, tokens: 1000 },
			initialBackendQuantities: { messages: 5000, tokens: 900 },
		});

		expect(result).toEqual([
			{ feature_id: "messages", quantity: 10000 },
			{ feature_id: "tokens", quantity: 2500 },
		]);
	});

	test("should include new prepaid items from the current plan", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [
				{ feature_id: "messages", included_usage: 0 },
				{ feature_id: "tokens", included_usage: 50 },
			],
			prepaidOptions: { messages: 5000, tokens: 3000 },
			initialPrepaidOptions: { messages: 1000 },
			initialBackendQuantities: { messages: 1000 },
		});

		expect(result).toEqual([
			{ feature_id: "messages", quantity: 5000 },
			{ feature_id: "tokens", quantity: 3000 },
		]);
	});

	test("should resend the same total when included usage changes", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "AI_CREDITS", included_usage: 500 }],
			prepaidOptions: { AI_CREDITS: 750 },
			initialPrepaidOptions: { AI_CREDITS: 750 },
			initialBackendQuantities: { AI_CREDITS: 500 },
		});

		expect(result).toEqual([{ feature_id: "AI_CREDITS", quantity: 750 }]);
	});

	test("should ignore prepaid options for removed current items", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [],
			prepaidOptions: { storage: 100 },
			initialPrepaidOptions: {},
			initialBackendQuantities: { storage: 100 },
		});

		expect(result).toEqual([]);
	});

	test("should return empty array when no quantities changed", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [
				{ feature_id: "messages", included_usage: 0 },
				{ feature_id: "tokens", included_usage: 0 },
			],
			prepaidOptions: { messages: 1000, tokens: 500 },
			initialPrepaidOptions: { messages: 1000, tokens: 500 },
			initialBackendQuantities: { messages: 1000, tokens: 500 },
		});

		expect(result).toEqual([]);
	});

	test("should handle included_usage as 'inf' by treating as 0", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: "inf" }],
			prepaidOptions: { messages: 5000 },
			initialPrepaidOptions: { messages: 1000 },
			initialBackendQuantities: { messages: 1000 },
		});

		// typeof "inf" !== "number", so includedUsage defaults to 0
		expect(result).toEqual([{ feature_id: "messages", quantity: 5000 }]);
	});

	test("should clamp totals below the current included usage", () => {
		const result = buildUpdateSubscriptionOptions({
			prepaidItems: [{ feature_id: "messages", included_usage: 200 }],
			prepaidOptions: { messages: 150 },
			initialPrepaidOptions: { messages: 0 },
			initialBackendQuantities: { messages: 0 },
		});

		expect(result).toEqual([{ feature_id: "messages", quantity: 200 }]);
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
			initialPrepaidOptions: { int_messages: 1000 },
			initialBackendQuantities: { int_messages: 1000 },
		});

		expect(result).toEqual([{ feature_id: "int_messages", quantity: 3000 }]);
	});
});
