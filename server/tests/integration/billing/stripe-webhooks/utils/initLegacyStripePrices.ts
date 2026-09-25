import {
	BillingVersion,
	type FullProduct,
	priceHasMissingStripeResources,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";

// Catalog creation initializes V2 resources; legacy back-sync fixtures also need V1 slots.
export const initLegacyStripePrices = async ({
	ctx,
	products,
}: {
	ctx: TestContext;
	products: FullProduct[];
}) => {
	for (const product of products) {
		for (const price of product.prices) {
			if (!priceHasMissingStripeResources({ price, product })) continue;
			await createStripePriceIFNotExist({
				ctx,
				price,
				product,
				entitlements: product.entitlements,
				billingVersion: BillingVersion.V1,
			});
			if (priceHasMissingStripeResources({ price, product })) {
				throw new Error(
					`Stripe resources incomplete for fixture price ${price.id}`,
				);
			}
		}
	}
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
};
