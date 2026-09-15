import { expect, test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import { visiblePlanItems } from "@/views/onboarding/panels/catalogGrouping";

test("visible plan items exclude the base price", () => {
	const basePrice = { price: 2, interval: "month" } as ProductItem;
	const featureItem = {
		feature_id: "message_credits",
		included_usage: 10,
		interval: "month",
	} as ProductItem;

	const result = visiblePlanItems({ items: [basePrice, featureItem] });

	expect(result).toEqual({
		items: [featureItem],
		hiddenItemCount: 0,
	});
});
