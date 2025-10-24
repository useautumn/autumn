import { ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { createSharedProducts } from "@/utils/scriptUtils/testUtils/createSharedProduct.js";
/**
 * Shared default product for basic test group
 * Used by multiple tests (basic1, basic3) to avoid conflicts
 * ID is NOT prefixed - shared across all tests in this group
 */
export const sharedDefaultFree = constructProduct({
	id: "shared-default-free",
	type: "free",
	isDefault: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
			interval: ProductItemInterval.Month,
		}),
	],
});

export const sharedProProduct = constructProduct({
	id: "shared-pro-product",
	isDefault: false,
	type: "pro",
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
	],
});

await (async () => {
	await createSharedProducts({
		ctx,
		products: [sharedDefaultFree, sharedProProduct],
	});
})();
