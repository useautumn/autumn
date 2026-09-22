import { ErrCode, type FullProduct, RecaseError } from "@autumn/shared";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
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

type InheritedStripeIds = {
	processor: FullProduct["processor"];
	priceConfigs: Map<string, FullProduct["prices"][number]["config"]>;
};

const snapshotStripeIds = ({
	variant,
}: {
	variant: FullProduct;
}): InheritedStripeIds => ({
	processor: variant.processor,
	priceConfigs: new Map(
		variant.prices.map((price) => [price.id!, { ...price.config }]),
	),
});

const writeStripeIds = async ({
	ctx,
	variant,
	processor,
	priceConfigs,
}: {
	ctx: AutumnContext;
	variant: FullProduct;
	processor: FullProduct["processor"];
	priceConfigs: Map<string, FullProduct["prices"][number]["config"]>;
}) => {
	for (const price of variant.prices) {
		const config = priceConfigs.get(price.id!);
		if (!config) continue;

		price.config = config;
		await PriceService.update({
			db: ctx.db,
			id: price.id!,
			update: { config },
		});
	}

	variant.processor = processor;
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: variant.internal_id,
		update: { processor },
	});
};

const clearSharedStripeIds = async ({
	ctx,
	variant,
}: {
	ctx: AutumnContext;
	variant: FullProduct;
}) =>
	writeStripeIds({
		ctx,
		variant,
		processor: null,
		priceConfigs: new Map(
			variant.prices.map((price) => {
				const config = { ...price.config } as Record<string, unknown>;
				for (const key of SHARED_STRIPE_PRICE_KEYS) config[key] = null;
				return [price.id!, config as FullProduct["prices"][number]["config"]];
			}),
		),
	});

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

	// Restore the inherited ids if Stripe fails, so a failed split never leaves
	// the variant with no mapping at all.
	const inherited = snapshotStripeIds({ variant });
	await clearSharedStripeIds({ ctx, variant });
	try {
		await initProductInStripe({ ctx, product: variant, includeLive: true });
	} catch (error) {
		await writeStripeIds({ ctx, variant, ...inherited });
		throw error;
	}

	// listFull is cached, so the dashboard would keep serving the old mapping.
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });

	return ProductService.getFull({
		db: ctx.db,
		idOrInternalId: variantPlanId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
};
