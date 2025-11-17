import {
	BillingInterval,
	FreeTrialDuration,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { createSharedProducts } from "@/utils/scriptUtils/testUtils/createSharedProduct.js";

/**
 * Shared products for upgradeOld test group
 * Matches global products.pro, products.proWithTrial, products.premium, products.premiumWithTrial
 */

export const sharedProProduct = constructProduct({
	id: "shared-upgradeold-pro",
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

export const sharedProWithTrialProduct = constructProduct({
	id: "shared-upgradeold-pro-trial",
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
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: true,
		card_required: true,
	},
});

export const sharedPremiumProduct = constructProduct({
	id: "shared-upgradeold-premium",
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

export const sharedPremiumWithTrialProduct = constructProduct({
	id: "shared-upgradeold-premium-trial",
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
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: true,
		card_required: true,
	},
});

export const initUpgradeOldSharedProducts = async () => {
	await createSharedProducts({
		ctx,
		products: [
			sharedProProduct,
			sharedProWithTrialProduct,
			sharedPremiumProduct,
			sharedPremiumWithTrialProduct,
		],
	});
};

// Auto-init removed to prevent conflicts when running tests in parallel
// Each test file now initializes its own products with unique prefixes
// await initUpgradeOldSharedProducts();
