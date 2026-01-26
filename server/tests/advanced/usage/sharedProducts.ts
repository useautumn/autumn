import { BillingInterval, ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { createSharedProducts } from "@/utils/scriptUtils/testUtils/createSharedProduct.js";

/**
 * Shared products for usage test group
 * Matches global products.proWithOverage
 */

export const sharedProWithOverage = constructProduct({
	id: "pro-with-overage",
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 2000, // $20/month
			interval: BillingInterval.Month,
		}),
		constructArrearItem({
			featureId: TestFeature.Messages,
			// Overage pricing for usage beyond included
		}),
	],
});

export const initUsageSharedProducts = async () => {
	await createSharedProducts({
		ctx,
		products: [sharedProWithOverage],
	});
};

// Auto-init on import (backwards compat)
await initUsageSharedProducts();
