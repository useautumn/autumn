import { describe, expect, test } from "bun:test";
import { getPlanItemPrepaidQuantity } from "@/components/forms/shared/plan-items/PlanItemRow";

describe("getPlanItemPrepaidQuantity", () => {
	test("should prefer the form quantity over existing backend options", () => {
		const result = getPlanItemPrepaidQuantity({
			featureId: "AI_CREDITS",
			prepaidOptions: { AI_CREDITS: 750 },
			initialPrepaidOptions: { AI_CREDITS: 750 },
			existingOptions: [{ feature_id: "AI_CREDITS", quantity: 500 }],
			features: [],
		});

		expect(result).toBe(750);
	});

	test("should fall back to the initial quantity before existing options", () => {
		const result = getPlanItemPrepaidQuantity({
			featureId: "AI_CREDITS",
			prepaidOptions: {},
			initialPrepaidOptions: { AI_CREDITS: 750 },
			existingOptions: [{ feature_id: "AI_CREDITS", quantity: 500 }],
			features: [],
		});

		expect(result).toBe(750);
	});
});
