/**
 * Explicit opt-in to Stripe creation for tests whose precondition is "this plan
 * already exists in Stripe".
 *
 * Uses billing's attach-time creation body minus the zero-amount-price skip and
 * currency resolution — fine for preconditions, not byte-identical to post-attach.
 */

import type { FullProduct } from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initStripeResourcesForProducts } from "@/internal/billing/v2/providers/stripe/utils/common/initStripeResourcesForProducts.js";
import { ProductService } from "@/internal/products/ProductService.js";

export const materializeProductsInStripe = async ({
	ctx,
	products,
	candidateProducts = [],
}: {
	ctx: AutumnContext;
	products: FullProduct[];
	candidateProducts?: FullProduct[];
}): Promise<void> => {
	await initStripeResourcesForProducts({
		ctx,
		products,
		candidateProducts,
		allowCreate: true,
	});

	// Writes land straight in the DB, so the server would keep serving its
	// cached pre-materialization rows and fail to match the new Stripe ids.
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
};

/** Load plan → create Stripe resources → re-fetch so configs have real ids. */
export const materializePlanInStripe = async ({
	ctx,
	planId,
	version,
	candidateProducts = [],
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
	candidateProducts?: FullProduct[];
}): Promise<FullProduct> => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

	await materializeProductsInStripe({
		ctx,
		products: [product],
		candidateProducts,
	});

	return ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
};
