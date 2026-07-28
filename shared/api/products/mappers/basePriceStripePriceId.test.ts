import { describe, expect, test } from "bun:test";
import type { BasePriceParams } from "@api/products/components/basePrice/basePrice";
import { basePriceToProductItem } from "@api/products/components/basePrice/basePriceToProductItem";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { productItemToBasePriceParams } from "@utils/productV2Utils/productItemUtils/convertProductItem/productItemToBasePriceParams";
import { itemToPriceAndEnt } from "@utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt";
import type { SharedContext } from "../../../types/sharedContext";

const ctx = {
	org: { default_currency: "usd" },
	features: [],
} as unknown as SharedContext;

const importedBasePrice: BasePriceParams = {
	amount: 10,
	interval: BillingInterval.Month,
	stripe_price_id: "price_imported",
};

const createImportedItem = () =>
	basePriceToProductItem({ ctx, basePrice: importedBasePrice });

describe("base price Stripe price ID mapping", () => {
	test("preserves an imported Stripe price when rebuilding a fixed price", () => {
		const item = createImportedItem();

		const { newPrice } = itemToPriceAndEnt({
			item,
			orgId: "org_1",
			isCustom: true,
			features: [],
		});

		expect(newPrice?.config.stripe_price_id).toBe("price_imported");
	});

	test("preserves the Stripe price through ProductItem -> BasePriceParams", () => {
		const item = createImportedItem();

		expect(productItemToBasePriceParams({ item })?.stripe_price_id).toBe(
			"price_imported",
		);
	});
});
