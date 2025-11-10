import { BillingInterval, ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import {
	constructFeatureItem,
	constructArrearItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { createSharedProducts } from "@/utils/scriptUtils/testUtils/createSharedProduct.js";

/**
 * Shared products for multiProduct test group
 * Matches global attachProducts.{proGroup1, premiumGroup1, proGroup2, premiumGroup2, etc.}
 */

// Group 1 products (use Messages feature)
export const sharedProGroup1 = constructProduct({
	id: "proGroup1",
	group: "g1",
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 3000, // $30
			interval: BillingInterval.Month,
		}),
		constructArrearItem({
			featureId: TestFeature.Messages,
			pricePerUnit: 100, // $1.00 per unit
		}),
	],
});

export const sharedPremiumGroup1 = constructProduct({
	id: "premiumGroup1",
	group: "g1",
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 5000, // $50
			interval: BillingInterval.Month,
		}),
		constructArrearItem({
			featureId: TestFeature.Messages,
			pricePerUnit: 200, // $2.00 per unit
		}),
	],
});

export const sharedStarterGroup1 = constructProduct({
	id: "starterGroup1",
	group: "g1",
	type: "starter",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 1000, // $10
			interval: BillingInterval.Month,
		}),
		constructArrearItem({
			featureId: TestFeature.Messages,
			pricePerUnit: 50, // $0.50 per unit
		}),
	],
});

// Group 2 products (use Words feature)
export const sharedProGroup2 = constructProduct({
	id: "proGroup2",
	group: "g2",
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 4000, // $40
			interval: BillingInterval.Month,
		}),
		constructArrearItem({
			featureId: TestFeature.Words,
			pricePerUnit: 60, // $0.60 per unit
		}),
	],
});

export const sharedPremiumGroup2 = constructProduct({
	id: "premiumGroup2",
	group: "g2",
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 6000, // $60
			interval: BillingInterval.Month,
		}),
		constructArrearItem({
			featureId: TestFeature.Words,
			pricePerUnit: 90, // $0.90 per unit
		}),
	],
});

export const sharedStarterGroup2 = constructProduct({
	id: "starterGroup2",
	group: "g2",
	type: "starter",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructPriceItem({
			price: 2000, // $20
			interval: BillingInterval.Month,
		}),
		constructArrearItem({
			featureId: TestFeature.Words,
			pricePerUnit: 30, // $0.30 per unit
		}),
	],
});

export const sharedFreeGroup2 = constructProduct({
	id: "freeGroup2",
	group: "g2",
	type: "free",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 10,
		}),
	],
});

export const initMultiProductSharedProducts = async () => {
	await createSharedProducts({
		ctx,
		products: [
			sharedProGroup1,
			sharedPremiumGroup1,
			sharedStarterGroup1,
			sharedProGroup2,
			sharedPremiumGroup2,
			sharedStarterGroup2,
			sharedFreeGroup2,
		],
	});
};

// Auto-init on import (backwards compat)
await initMultiProductSharedProducts();
