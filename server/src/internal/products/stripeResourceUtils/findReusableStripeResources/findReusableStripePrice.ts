import {
	type FullProduct,
	getPriceStripeReuseLevel,
	isFixedPrice,
	type Price,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { priceRepo } from "@/internal/products/prices/repos/priceRepo.js";
import {
	hasEmptyStripeResource,
	isReusablePrepaidPrice,
	isReusableUsagePrice,
} from "./hasEmptyStripeResource.js";
import { isUsableStripePrice } from "./isUsableStripePrice.js";
import { stampAttachCurrencyStripeSlot } from "./stampAttachCurrencyStripeSlot.js";

const findNewestReusableCandidate = ({
	ctx,
	targetPrice,
	productId,
	targetCurrency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	productId: string;
	targetCurrency: string;
}) => {
	if (isFixedPrice(targetPrice)) {
		return priceRepo.findNewestReusableFixedPrice({
			ctx,
			targetPrice,
			productId,
			targetCurrency,
		});
	}
	if (isReusablePrepaidPrice(targetPrice)) {
		return priceRepo.findNewestReusablePrepaidPrice({
			ctx,
			targetPrice,
			productId,
			targetCurrency,
		});
	}
	if (isReusableUsagePrice(targetPrice)) {
		return priceRepo.findNewestReusableUsagePrice({
			ctx,
			targetPrice,
			productId,
			targetCurrency,
		});
	}
	return null;
};

const findReusableStripePriceForTarget = async ({
	ctx,
	targetPrice,
	product,
	currency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	product: FullProduct;
	currency: string;
}) => {
	if (!hasEmptyStripeResource({ ctx, targetPrice, currency })) return;

	const candidate = await findNewestReusableCandidate({
		ctx,
		targetPrice,
		productId: product.id,
		targetCurrency: currency,
	});
	if (!candidate) return;

	if (
		getPriceStripeReuseLevel({
			newPrice: targetPrice,
			candidatePrice: candidate,
			newEntitlements: [],
			candidateEntitlements: [],
		}) !== "full"
	) {
		return;
	}

	const usable = await isUsableStripePrice({
		ctx,
		targetPrice,
		candidate,
		product,
		currency,
	});
	if (!usable) return;

	await stampAttachCurrencyStripeSlot({
		ctx,
		targetPrice,
		sourcePrice: candidate,
		currency,
		slot: isReusablePrepaidPrice(targetPrice)
			? "stripe_prepaid_price_v2_id"
			: "stripe_price_id",
	});
};

export const findReusableStripePrice = async ({
	ctx,
	products,
	currency,
}: {
	ctx: AutumnContext;
	products: FullProduct[];
	currency: string;
}) => {
	await Promise.all(
		products.flatMap((product) =>
			product.prices.map((price) =>
				findReusableStripePriceForTarget({
					ctx,
					targetPrice: price,
					product,
					currency,
				}),
			),
		),
	);
};
