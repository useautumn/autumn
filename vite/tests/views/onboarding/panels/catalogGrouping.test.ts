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

test("nested previews count capped and collapsed items without counting the price", () => {
	const items = [
		{ price: 20, interval: "month" },
		{ feature_id: "requests", included_usage: 100, interval: "month" },
		{ feature_id: "projects", included_usage: 5, interval: "month" },
		{ feature_id: "storage", included_usage: 10, interval: "month" },
		...Array.from({ length: 7 }, (_, index) => ({
			feature_id: `boolean_${index}`,
		})),
	] as ProductItem[];
	const original = structuredClone(items);
	const parent = visiblePlanItems({ items });
	const nested = visiblePlanItems({ items, limit: 2 });

	expect(parent.items).toHaveLength(4);
	expect(parent.hiddenItemCount).toBe(6);
	expect(nested.items).toEqual([items[2], items[1]]);
	expect(nested.hiddenItemCount).toBe(8);
	expect(items).toEqual(original);
});
