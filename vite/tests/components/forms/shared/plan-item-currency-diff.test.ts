import { describe, expect, test } from "bun:test";
import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { getPlanItemsDiff } from "@/components/forms/shared/PlanItemsSection";
import { getItemAdditionalCurrencies } from "@/components/v2/planItemCurrencyUtils";

const topUpItem = (withSgd = false) =>
	({
		feature_id: "ai_credits",
		included_usage: 0,
		interval: null,
		usage_model: "prepaid",
		billing_units: 100,
		tiers: [
			{
				to: "inf",
				amount: 1,
				...(withSgd
					? { additional_currencies: [{ currency: "sgd", amount: 1.4 }] }
					: {}),
			},
		],
	}) as ProductItem;

describe("plan item currency diffs", () => {
	test("renders a single-tier currency addition as an item change", () => {
		const originalItem = topUpItem();
		const updatedItem = topUpItem(true);
		const diff = getPlanItemsDiff({
			product: { items: [updatedItem] } as FrontendProduct,
			originalItems: [originalItem],
			showDiff: true,
		});

		expect(diff.deletedItems).toEqual([originalItem]);
		expect(diff.diffVisibleItems).toEqual([updatedItem]);
		expect(getItemAdditionalCurrencies(updatedItem)).toEqual([
			{ currency: "sgd", amount: 1.4 },
		]);
	});

	test("deduplicates currencies across multiple tiers", () => {
		const item = topUpItem();
		item.tiers = [
			{
				to: 100,
				amount: 1,
				additional_currencies: [{ currency: "eur", amount: 0.9 }],
			},
			{
				to: "inf",
				amount: 0.8,
				additional_currencies: [{ currency: "EUR", amount: 0.7 }],
			},
		];

		expect(getItemAdditionalCurrencies(item)).toEqual([
			{ currency: "eur", amount: 0.9 },
		]);
	});
});
