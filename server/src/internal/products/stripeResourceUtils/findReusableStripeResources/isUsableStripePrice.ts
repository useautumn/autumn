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

const retrievedStripeProductId = ({
	product,
}: {
	product: string | { id?: string } | null;
}) => (typeof product === "string" ? product : (product?.id ?? null));

export type UsableStripePriceEvaluation = {
	usable: boolean;
	reason?:
		| "no-stripe-id"
		| "no-expected-product"
		| "retrieve-miss"
		| "inactive"
		| "no-entitlement"
		| "shape-mismatch"
		| "unsupported-kind";
	stripePriceId?: string | null;
	expectedStripeProductId?: string | null;
	retrievedStripeProductId?: string | null;
};

export const evaluateUsableStripePrice = async ({
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
}): Promise<UsableStripePriceEvaluation> => {
	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();
	const prepaid = isReusablePrepaidPrice(targetPrice);
	const stripePriceId = getPriceCurrencyStripeId({
		config: candidate.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot: prepaid ? "stripe_prepaid_price_v2_id" : "stripe_price_id",
	});
	if (!stripePriceId) return { usable: false, reason: "no-stripe-id" };

	const expectedStripeProductId = isFixedPrice(targetPrice)
		? (product.processor?.id ??
			(candidate.config as FixedPriceConfig).stripe_product_id)
		: expectedUsageStripeProductId({ targetPrice, candidate, product });
	if (!expectedStripeProductId) {
		return { usable: false, reason: "no-expected-product", stripePriceId };
	}

	const stripePrice = await getStripePrice({
		stripeClient: createStripeCli({ org: ctx.org, env: ctx.env }),
		stripePriceId,
		expand: prepaid ? ["tiers"] : undefined,
	});
	if (!stripePrice) {
		return {
			usable: false,
			reason: "retrieve-miss",
			stripePriceId,
			expectedStripeProductId,
		};
	}

	const retrievedProductId = retrievedStripeProductId({
		product: stripePrice.product,
	});
	const ids = {
		stripePriceId,
		expectedStripeProductId,
		retrievedStripeProductId: retrievedProductId,
	};

	if (isFixedPrice(targetPrice)) {
		if (
			stripePriceMatchesFixedPrice({
				stripePrice,
				price: targetPrice,
				stripeProductId: expectedStripeProductId,
				currency,
			})
		) {
			return { usable: true, ...ids };
		}
		return {
			usable: false,
			reason: stripePrice.active ? "shape-mismatch" : "inactive",
			...ids,
		};
	}

	if (prepaid) {
		if (
			stripePriceMatchesPrepaidPrice({
				stripePrice,
				price: targetPrice,
				product,
				stripeProductId: expectedStripeProductId,
				currency,
				org: ctx.org,
			})
		) {
			return { usable: true, ...ids };
		}
		return {
			usable: false,
			reason: stripePrice.active ? "shape-mismatch" : "inactive",
			...ids,
		};
	}

	if (isConsumablePrice(targetPrice)) {
		if (
			!priceToEnt({
				price: targetPrice,
				entitlements: product.entitlements,
			})
		) {
			return { usable: false, reason: "no-entitlement", ...ids };
		}
		if (
			stripePriceMatchesConsumablePrice({
				stripePrice,
				price: targetPrice,
				product,
				stripeProductId: expectedStripeProductId,
				currency,
				org: ctx.org,
			})
		) {
			return { usable: true, ...ids };
		}
		return {
			usable: false,
			reason: stripePrice.active ? "shape-mismatch" : "inactive",
			...ids,
		};
	}

	if (isAllocatedPrice(targetPrice) && isReusableUsagePrice(targetPrice)) {
		if (
			stripePriceMatchesAllocatedPrice({
				stripePrice,
				price: targetPrice,
				product,
				stripeProductId: expectedStripeProductId,
				currency,
				org: ctx.org,
			})
		) {
			return { usable: true, ...ids };
		}
		return {
			usable: false,
			reason: stripePrice.active ? "shape-mismatch" : "inactive",
			...ids,
		};
	}

	return { usable: false, reason: "unsupported-kind", ...ids };
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
}): Promise<boolean> =>
	(
		await evaluateUsableStripePrice({
			ctx,
			targetPrice,
			candidate,
			product,
			currency,
		})
	).usable;
