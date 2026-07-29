import { describe, expect, test } from "bun:test";
import {
	ProductItemFeatureType,
	ProductItemInterval,
	UsageModel,
	type ProductItem,
	isOneOffProductV2,
	type ProductV2,
} from "@autumn/shared";
import { productV2ToProperties } from "../../../../shared/utils/productV2Utils/productV2ToProperties.js";

const prepaidSeats = (priceInterval: ProductItemInterval | null): ProductItem =>
	({
		feature_id: "seats",
		feature_type: ProductItemFeatureType.ContinuousUse,
		included_usage: 90,
		interval: null,
		price_interval: priceInterval,
		usage_model: UsageModel.Prepaid,
		price: 90,
	}) as ProductItem;

describe("product v2 one-off classification", () => {
	test("prepaid priced features with recurring price intervals are subscriptions", () => {
		const items = [prepaidSeats(ProductItemInterval.Year)];

		expect(isOneOffProductV2({ items })).toBe(false);
		expect(
			productV2ToProperties({
				productV2: { items } as ProductV2,
				trialAvailable: false,
			}).is_one_off,
		).toBe(false);
	});

	test("priced items without a recurring price interval are one-off", () => {
		const items = [prepaidSeats(null)];

		expect(isOneOffProductV2({ items })).toBe(true);
		expect(
			productV2ToProperties({
				productV2: { items } as ProductV2,
				trialAvailable: false,
			}).is_one_off,
		).toBe(true);
	});
});
