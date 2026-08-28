/**
 * Mint Stripe product/price ids onto every version of a plan, then re-fetch.
 * Bypasses catalog `disable_stripe_writes` so tests see real prepaid v2 slots.
 */

import type { FullProduct } from "@autumn/shared";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkStripeProductExists } from "@/internal/products/productUtils.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Load plan → create Stripe resources → re-fetch so configs have real ids. */
export const initPlanStripeResources = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<FullProduct> => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});

	const productsToInit = versions.length > 0 ? versions : [product];
	for (const version of productsToInit) {
		await checkStripeProductExists({
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			product: version,
			logger: ctx.logger,
		});
		for (const price of version.prices) {
			await createStripePriceIFNotExist({
				ctx,
				price,
				entitlements: version.entitlements,
				product: version,
			});
		}
	}
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });

	return ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
};
