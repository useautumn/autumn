import { describe, expect, test } from "bun:test";
import { buildLegacyUpdateSubscriptionOptions } from "@/components/forms/update-subscription/use-update-subscription-body-builder";

describe("buildLegacyUpdateSubscriptionOptions", () => {
	test("should pass displayed prepaid quantities through unchanged", () => {
		const result = buildLegacyUpdateSubscriptionOptions({
			prepaidOptions: { AI_CREDITS: 750 },
		});

		expect(result).toEqual([{ feature_id: "AI_CREDITS", quantity: 750 }]);
	});

	test("should return an empty array when prepaid options are missing", () => {
		const result = buildLegacyUpdateSubscriptionOptions({});

		expect(result).toEqual([]);
	});
});
