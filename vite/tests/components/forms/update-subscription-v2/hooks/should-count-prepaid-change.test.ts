import { describe, expect, test } from "bun:test";
import { ProductItemFeatureType, ProductItemInterval } from "@autumn/shared";
import { shouldCountPrepaidChange } from "@/components/forms/update-subscription-v2/hooks/useHasSubscriptionChanges";

describe("shouldCountPrepaidChange", () => {
	test("counts a decrease on a non-consumable (continuous use) one-off item", () => {
		// Non-consumables are continuous-use levels with interval null. Lowering the
		// quantity (300 -> 200) is a real change and must trigger the update call.
		const result = shouldCountPrepaidChange({
			item: {
				interval: null,
				feature_type: ProductItemFeatureType.ContinuousUse,
			},
			newlyAdded: false,
			initialQuantity: 300,
			updatedQuantity: 200,
		});

		expect(result).toBe(true);
	});

	test("does NOT count a decrease on a consumable one-off top-up", () => {
		// Consumable top-ups can only be increased — a lower total is not a purchase.
		const result = shouldCountPrepaidChange({
			item: {
				interval: null,
				feature_type: ProductItemFeatureType.SingleUse,
			},
			newlyAdded: false,
			initialQuantity: 1000,
			updatedQuantity: 800,
		});

		expect(result).toBe(false);
	});

	test("counts an increase on a consumable one-off top-up", () => {
		const result = shouldCountPrepaidChange({
			item: {
				interval: null,
				feature_type: ProductItemFeatureType.SingleUse,
			},
			newlyAdded: false,
			initialQuantity: 1000,
			updatedQuantity: 1500,
		});

		expect(result).toBe(true);
	});

	test("counts any change on a recurring item", () => {
		const result = shouldCountPrepaidChange({
			item: {
				interval: ProductItemInterval.Month,
				feature_type: ProductItemFeatureType.SingleUse,
			},
			newlyAdded: false,
			initialQuantity: 300,
			updatedQuantity: 200,
		});

		expect(result).toBe(true);
	});

	test("ignores newly added items (handled elsewhere)", () => {
		const result = shouldCountPrepaidChange({
			item: {
				interval: null,
				feature_type: ProductItemFeatureType.ContinuousUse,
			},
			newlyAdded: true,
			initialQuantity: 0,
			updatedQuantity: 200,
		});

		expect(result).toBe(false);
	});
});
