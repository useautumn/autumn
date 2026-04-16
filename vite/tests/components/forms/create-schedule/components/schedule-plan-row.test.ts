import { describe, expect, test } from "bun:test";
import { AppEnv, type ProductItem, type ProductV2 } from "@autumn/shared";
import {
	getItemUnitPrice,
	getPlanPriceLabel,
} from "@/components/forms/create-schedule/components/SchedulePlanRow";

function makeProduct({
	id = "prod_1",
	items = [],
}: {
	id?: string;
	items?: ProductV2["items"];
} = {}): ProductV2 {
	return {
		id,
		name: "Test",
		is_add_on: false,
		is_default: false,
		version: 1,
		group: null,
		env: AppEnv.Sandbox,
		items,
		created_at: Date.now(),
	};
}

const basePriceItem: ProductItem = {
	feature_id: null,
	price: 15,
	interval: "month",
	interval_count: 1,
} as ProductItem;

const featurePriceViaPrice: ProductItem = {
	feature_id: "users",
	price: 10,
	tiers: null,
	interval: "month",
	interval_count: 1,
} as ProductItem;

const featurePriceViaTiers: ProductItem = {
	feature_id: "users",
	price: null,
	tiers: [{ to: -1, amount: 10 }],
	interval: "month",
	interval_count: 1,
} as ProductItem;

const multiTierItem: ProductItem = {
	feature_id: "storage",
	price: null,
	tiers: [
		{ to: 100, amount: 0.5 },
		{ to: -1, amount: 0.25 },
	],
	interval: "month",
	interval_count: 1,
} as ProductItem;

const freeFeatureItem: ProductItem = {
	feature_id: "support",
	price: null,
	tiers: null,
	interval: null,
} as ProductItem;

describe("getItemUnitPrice", () => {
	test("returns price for base price item", () => {
		expect(getItemUnitPrice(basePriceItem)).toBe(15);
	});

	test("returns price for feature item with direct price", () => {
		expect(getItemUnitPrice(featurePriceViaPrice)).toBe(10);
	});

	test("returns tiers[0].amount for single-tier feature item", () => {
		expect(getItemUnitPrice(featurePriceViaTiers)).toBe(10);
	});

	test("returns null for multi-tier feature item", () => {
		expect(getItemUnitPrice(multiTierItem)).toBeNull();
	});

	test("returns null for free feature item", () => {
		expect(getItemUnitPrice(freeFeatureItem)).toBeNull();
	});
});

describe("getPlanPriceLabel", () => {
	test("returns Free when no priced items", () => {
		const product = makeProduct({ items: [freeFeatureItem] });
		expect(getPlanPriceLabel({ product })).toBe("Free");
	});

	test("returns base price only when no feature prices", () => {
		const product = makeProduct({ items: [basePriceItem] });
		const label = getPlanPriceLabel({ product });
		expect(label).toContain("15");
		expect(label).toContain("/month");
	});

	test("sums base price + feature price with prepaid quantity", () => {
		const product = makeProduct({
			items: [basePriceItem, featurePriceViaTiers],
		});
		const label = getPlanPriceLabel({
			product,
			prepaidOptions: { users: 5 },
		});
		expect(label).toContain("65");
		expect(label).toContain("/month");
	});

	test("uses single-tier amount for feature items with tiers", () => {
		const product = makeProduct({ items: [featurePriceViaTiers] });
		const label = getPlanPriceLabel({
			product,
			prepaidOptions: { users: 3 },
		});
		expect(label).toContain("30");
	});

	test("multiplies by 1 when feature has no prepaid option", () => {
		const product = makeProduct({
			items: [basePriceItem, featurePriceViaTiers],
		});
		const label = getPlanPriceLabel({ product });
		expect(label).toContain("25");
	});

	test("skips multi-tier items (cannot compute fixed total)", () => {
		const product = makeProduct({ items: [basePriceItem, multiTierItem] });
		const label = getPlanPriceLabel({ product });
		expect(label).toContain("15");
	});

	test("uses customItems over product.items when provided", () => {
		const product = makeProduct({ items: [basePriceItem] });
		const customItems = [
			{ ...basePriceItem, price: 20 } as ProductItem,
			featurePriceViaTiers,
		];
		const label = getPlanPriceLabel({
			product,
			customItems,
			prepaidOptions: { users: 5 },
		});
		expect(label).toContain("70");
	});

	test("returns Free when customItems has no priced items", () => {
		const product = makeProduct({ items: [basePriceItem] });
		expect(
			getPlanPriceLabel({ product, customItems: [freeFeatureItem] }),
		).toBe("Free");
	});
});
