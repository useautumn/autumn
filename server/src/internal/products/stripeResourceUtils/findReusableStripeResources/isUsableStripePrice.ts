import {
	type CurrencyAwarePriceConfig,
	type FixedPriceConfig,
	type FullProduct,
	getPriceCurrencyStripeId,
	isAllocatedPrice,
	isConsumablePrice,
	isFixedPrice,
	orgToCurrency,
	type Price,
	priceToEnt,
	type UsagePriceConfig,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripePrice } from "@/external/stripe/prices/operations/getStripePrice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	stripePriceMatchesAllocatedPrice,
	stripePriceMatchesConsumablePrice,
	stripePriceMatchesFixedPrice,
	stripePriceMatchesPrepaidPrice,
} from "@/internal/billing/v2/providers/stripe/utils/sync/matchUtils/stripePriceMatchesAutumnPrice.js";
import {
	isReusablePrepaidPrice,
	isReusableUsagePrice,
} from "./hasEmptyStripeResource.js";

const expectedUsageStripeProductId = ({
	targetPrice,
	candidate,
	product,
}: {
	targetPrice: Price;
	candidate: Price;
	product: FullProduct;
}) => {
	const candidateProductId = (candidate.config as UsagePriceConfig)
		.stripe_product_id;
	if (candidateProductId) return candidateProductId;

	const entitlement = priceToEnt({
		price: targetPrice,
		entitlements: product.entitlements,
	});
	return entitlement?.feature.stripe_product_id ?? null;
};

export const isUsableStripePrice = async ({
	ctx,
	targetPrice,
	candidate,
	product,
	currency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	candidate: Price;
	product: FullProduct;
	currency: string;
}): Promise<boolean> => {
	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();
	const prepaid = isReusablePrepaidPrice(targetPrice);
	const stripePriceId = getPriceCurrencyStripeId({
		config: candidate.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot: prepaid ? "stripe_prepaid_price_v2_id" : "stripe_price_id",
	});
	if (!stripePriceId) return false;

	const expectedStripeProductId = isFixedPrice(targetPrice)
		? (product.processor?.id ??
			(candidate.config as FixedPriceConfig).stripe_product_id)
		: expectedUsageStripeProductId({ targetPrice, candidate, product });
	if (!expectedStripeProductId) return false;

	const stripePrice = await getStripePrice({
		stripeClient: createStripeCli({ org: ctx.org, env: ctx.env }),
		stripePriceId,
		expand: prepaid ? ["tiers"] : undefined,
	});
	if (!stripePrice) return false;

	if (isFixedPrice(targetPrice)) {
		return stripePriceMatchesFixedPrice({
			stripePrice,
			price: targetPrice,
			stripeProductId: expectedStripeProductId,
			currency,
		});
	}

	if (prepaid) {
		return stripePriceMatchesPrepaidPrice({
			stripePrice,
			price: targetPrice,
			product,
			stripeProductId: expectedStripeProductId,
			currency,
			org: ctx.org,
		});
	}

	if (isConsumablePrice(targetPrice)) {
		if (
			!priceToEnt({
				price: targetPrice,
				entitlements: product.entitlements,
			})
		) {
			return false;
		}
		return stripePriceMatchesConsumablePrice({
			stripePrice,
			price: targetPrice,
			product,
			stripeProductId: expectedStripeProductId,
			currency,
			org: ctx.org,
		});
	}

	if (isAllocatedPrice(targetPrice) && isReusableUsagePrice(targetPrice)) {
		return stripePriceMatchesAllocatedPrice({
			stripePrice,
			price: targetPrice,
			product,
			stripeProductId: expectedStripeProductId,
			currency,
			org: ctx.org,
		});
	}

	return false;
};
