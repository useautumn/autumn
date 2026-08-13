/**
 * Init Stripe product/price resources for a plan via the production path
 * (`initStripeResourcesForProducts`) — same call `updateProduct` makes after
 * item updates. Prefer this over manually seeding stripe_* ids on price rows.
 */

import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Load plan → create Stripe resources → re-fetch so configs have real ids. */
export const initPlanStripeResources = async ({
	ctx,
	planId,
	candidateProducts = [],
}: {
	ctx: AutumnContext;
	planId: string;
	candidateProducts?: FullProduct[];
}): Promise<FullProduct> => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await initStripeResourcesForProducts({
		ctx,
		products: [product],
		candidateProducts,
	});

	return ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
};
