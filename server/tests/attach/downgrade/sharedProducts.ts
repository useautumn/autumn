import { BillingInterval, ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { createSharedProducts } from "@/utils/scriptUtils/testUtils/createSharedProduct.js";

/**
 * Shared products for downgrade test group
 * Matches global products.free, products.pro, products.premium
 */

export const sharedFreeProduct = constructProduct({
	id: "shared-downgrade-free",
	type: "free",
	isDefault: true,
	excludeBase: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
			interval: ProductItemInterval.Month,
		}),
	],
});

export const sharedProProduct = constructProduct({
	id: "shared-downgrade-pro",
	type: "pro",
	excludeBase: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
		constructPriceItem({
			price: 2000,
			interval: BillingInterval.Month,
		}),
	],
});

export const sharedPremiumProduct = constructProduct({
	id: "shared-downgrade-premium",
	type: "premium",
	excludeBase: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 5000,
			interval: BillingInterval.Month,
		}),
	],
});

export const initDowngradeSharedProducts = async () => {
	await createSharedProducts({
		ctx,
		products: [sharedFreeProduct, sharedProProduct, sharedPremiumProduct],
	});
};

// Auto-init on import (backwards compat)
await initDowngradeSharedProducts();
