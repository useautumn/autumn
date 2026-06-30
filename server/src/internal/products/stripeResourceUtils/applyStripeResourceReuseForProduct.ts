import {
	copyStripeResourcesToMatchingPrice,
	type FullProduct,
	hasMissingStripeResourcesForProduct,
	isPreviewStripeId,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";

const hasUsableStripeId = (stripeId?: string | null) =>
	Boolean(stripeId) && !isPreviewStripeId({ stripeId });

const copyProcessor = async ({
	ctx,
	product,
	source,
}: {
	ctx: AutumnContext;
	product: FullProduct;
	source: FullProduct;
}) => {
	if (hasUsableStripeId(product.processor?.id)) return;
	if (!hasUsableStripeId(source.processor?.id)) return;

	product.processor = {
		type: source.processor?.type ?? ProcessorType.Stripe,
		id: source.processor!.id,
	};
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: product.internal_id,
		update: { processor: product.processor },
	});
};

const copyPrices = async ({
	ctx,
	product,
	source,
}: {
	ctx: AutumnContext;
	product: FullProduct;
	source: FullProduct;
}) => {
	for (const targetPrice of product.prices) {
		const candidatePrices =
			source.internal_id === product.internal_id
				? source.prices.filter((price) => price.id !== targetPrice.id)
				: source.prices;
		if (candidatePrices.length === 0) continue;

		const { copiedFields } = copyStripeResourcesToMatchingPrice({
			targetPrice,
			candidatePrices,
			targetEntitlements: product.entitlements,
			candidateEntitlements: source.entitlements,
		});
		if (copiedFields.length === 0) continue;

		await PriceService.update({
			db: ctx.db,
			id: targetPrice.id,
			update: { config: targetPrice.config },
		});
	}
};

export const applyStripeResourceReuseForProduct = async ({
	ctx,
	product,
	candidateProducts = [],
}: {
	ctx: AutumnContext;
	product: FullProduct;
	candidateProducts?: FullProduct[];
}) => {
	for (const source of [product, ...candidateProducts]) {
		await copyProcessor({ ctx, product, source });
		await copyPrices({ ctx, product, source });
		if (!hasMissingStripeResourcesForProduct({ product })) return;
	}
};
