import {
	ErrCode,
	hasMissingStripeResourcesForProduct,
	RecaseError,
} from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";

/** Creates the Stripe product and prices for a plan that has never been pushed. */
export const createPlanInStripe = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const plan = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	// The product is persisted before its prices, so a failure part way through
	// leaves the plan mapped but incomplete. Only refuse a plan that is done.
	if (
		plan.processor?.id &&
		!hasMissingStripeResourcesForProduct({ product: plan })
	) {
		throw new RecaseError({
			message: `Plan ${planId} already has a Stripe product.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	await initProductInStripe({ ctx, product: plan, includeLive: true });

	const created = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (!created.processor?.id) {
		throw new RecaseError({
			message: `Could not create a Stripe product for ${planId}. Check that Stripe is connected and writes are enabled.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (hasMissingStripeResourcesForProduct({ product: created })) {
		await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
		throw new RecaseError({
			message: `Created the Stripe product for ${planId}, but some prices are still missing. Run this again to finish.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// listFull is cached, so the mappings page would keep showing it unmapped.
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });

	return created;
};
