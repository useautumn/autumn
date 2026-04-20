import { describe, expect, test } from "bun:test";
import { AppEnv, type ProductItem, type ProductV2 } from "@autumn/shared";
import { getSchedulePlanPriceProduct } from "@/components/forms/create-schedule/components/SchedulePlanRow";
import { getProductPriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";

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

describe("getSchedulePlanPriceProduct + getProductPriceDisplay", () => {
	const getPlanPriceLabel = ({
		product,
		customItems,
	}: {
		product: ProductV2;
		customItems?: ProductItem[] | null;
	}) => {
		const priceProduct = getSchedulePlanPriceProduct({ product, customItems });
		const priceDisplay = getProductPriceDisplay({
			product: priceProduct,
			currency: "USD",
		});

		return priceDisplay.type === "free"
			? "Free"
			: `${priceDisplay.formattedPrice} ${priceDisplay.intervalText}`;
	};

	test("returns Free when no priced items", () => {
		const product = makeProduct({ items: [freeFeatureItem] });
		expect(getPlanPriceLabel({ product })).toBe("Free");
	});

	test("returns base price only when no feature prices", () => {
		const product = makeProduct({ items: [basePriceItem] });
		const label = getPlanPriceLabel({ product });
		expect(label).toContain("15");
		expect(label).toContain("per month");
	});

	test("uses base price display when plan also has priced features", () => {
		const product = makeProduct({
			items: [basePriceItem, featurePriceViaTiers],
		});
		const label = getPlanPriceLabel({ product });
		expect(label).toContain("15");
		expect(label).toContain("per month");
	});

	test("returns Free when plan only has priced feature items", () => {
		const product = makeProduct({ items: [featurePriceViaTiers] });
		expect(getPlanPriceLabel({ product })).toBe("Free");
	});

	test("uses base price even when priced feature is multi-tier", () => {
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
		const label = getPlanPriceLabel({ product, customItems });
		expect(label).toContain("20");
		expect(label).toContain("per month");
	});

	test("returns Free when customItems only has priced features", () => {
		const product = makeProduct({ items: [basePriceItem] });
		expect(getPlanPriceLabel({ product, customItems: [featurePriceViaPrice] })).toBe("Free");
	});
});
