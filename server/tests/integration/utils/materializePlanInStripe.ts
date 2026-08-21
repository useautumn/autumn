/**
 * Test-side Stripe materialization. Since sandbox creates Stripe resources
 * lazily (at billing time, like live), tests whose precondition is "this
 * plan already exists in Stripe" opt into creation explicitly here.
 *
 * Uses the same creation body billing runs at attach time, minus attach's
 * zero-amount-price skip and currency resolution — fine for preconditions,
 * not byte-identical to post-attach state.
 */

import type { FullProduct } from "@autumn/shared";
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
