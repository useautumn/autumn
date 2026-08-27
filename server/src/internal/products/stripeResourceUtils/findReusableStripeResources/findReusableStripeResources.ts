import {
	type CurrencyAwarePriceConfig,
	getPriceCurrencyStripeId,
	getPriceStripeReuseLevel,
	isFixedPrice,
	type Price,
} from "@autumn/shared";
import { copyAttachCurrencyStripeSlot } from "./copyAttachCurrencyStripeSlot.js";
import { rankStripeReuseCandidates } from "./rankStripeReuseCandidates.js";
import type {
	StripeReuseCandidate,
	StripeReuseProductRef,
} from "./types/stripeReuseCandidate.js";

const candidateHasAttachCurrencySlot = ({
	price,
	currency,
	orgDefaultCurrency,
}: {
	price: Price;
	currency: string;
	orgDefaultCurrency: string;
}) =>
	Boolean(
		getPriceCurrencyStripeId({
			config: price.config as CurrencyAwarePriceConfig,
			currency,
			orgDefault: orgDefaultCurrency,
			slot: "stripe_price_id",
		}),
	);

const isSameProductScope = ({
	targetProduct,
	candidateProduct,
}: {
	targetProduct: StripeReuseProductRef;
	candidateProduct: StripeReuseProductRef;
}) =>
	candidateProduct.id === targetProduct.id &&
	candidateProduct.org_id === targetProduct.org_id &&
	candidateProduct.env === targetProduct.env;

export const findReusableStripeResources = ({
	targetPrice,
	targetProduct,
	candidates,
	currency,
	orgDefaultCurrency,
}: {
	targetPrice: Price;
	targetProduct: StripeReuseProductRef;
	candidates: StripeReuseCandidate[];
	currency: string;
	orgDefaultCurrency: string;
}): Price | null => {
	if (!isFixedPrice(targetPrice)) return null;

	const matches = candidates.filter((candidate) => {
		if (candidate.price.id === targetPrice.id) return false;
		if (!isFixedPrice(candidate.price)) return false;
		if (
			!isSameProductScope({
				targetProduct,
				candidateProduct: candidate.product,
			})
		) {
			return false;
		}
		if (
			getPriceStripeReuseLevel({
				newPrice: targetPrice,
				candidatePrice: candidate.price,
				newEntitlements: [],
				candidateEntitlements: [],
			}) !== "full"
		) {
			return false;
		}
		return candidateHasAttachCurrencySlot({
			price: candidate.price,
			currency,
			orgDefaultCurrency,
		});
	});

	const [winner] = rankStripeReuseCandidates({ candidates: matches });
	if (!winner) return null;

	const copied = copyAttachCurrencyStripeSlot({
		targetPrice,
		sourcePrice: winner.price,
		currency,
		orgDefaultCurrency,
	});
	return copied ? winner.price : null;
};
