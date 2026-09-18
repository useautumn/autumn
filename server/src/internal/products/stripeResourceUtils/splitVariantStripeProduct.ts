import { ErrCode, type FullProduct, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { initProductInStripe } from "@/internal/products/productUtils.js";

const SHARED_STRIPE_PRICE_KEYS = [
	"stripe_price_id",
	"stripe_product_id",
	"stripe_prepaid_price_v2_id",
	"stripe_placeholder_price_id",
] as const;

const clearSharedStripeIds = async ({
	ctx,
	variant,
}: {
	ctx: AutumnContext;
	variant: FullProduct;
}) => {
	for (const price of variant.prices) {
		const config = { ...price.config } as Record<string, unknown>;
		for (const key of SHARED_STRIPE_PRICE_KEYS) config[key] = null;

		price.config = config as typeof price.config;
		await PriceService.update({
			db: ctx.db,
			id: price.id!,
			update: { config: price.config },
		});
	}

	variant.processor = null;
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: variant.internal_id,
		update: { processor: null },
	});
};

/** Existing subscriptions stay on the prices they were created with. */
export const splitVariantStripeProduct = async ({
	ctx,
	variantPlanId,
}: {
	ctx: AutumnContext;
	variantPlanId: string;
}) => {
	const variant = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: variantPlanId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (!variant.base_internal_product_id) {
		throw new RecaseError({
			message: `Plan ${variantPlanId} is not a variant, so it already owns its Stripe product.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const base = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: variant.base_internal_product_id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	if (variant.processor?.id && variant.processor.id !== base.processor?.id) {
		return variant;
	}

	await clearSharedStripeIds({ ctx, variant });
	await initProductInStripe({ ctx, product: variant, includeLive: true });

	return ProductService.getFull({
		db: ctx.db,
		idOrInternalId: variantPlanId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
};
