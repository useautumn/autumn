import {
	type CurrencyAwarePriceConfig,
	type FullProduct,
	getPriceCurrencyStripeId,
	getPriceStripeReuseLevel,
	isFixedPrice,
	orgToCurrency,
	type Price,
	priceConfigForCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	logStripePriceReuse,
	type StripePriceReuseEntry,
} from "@/internal/billing/v2/providers/stripe/logs/logStripePriceReuse.js";
import { priceRepo } from "@/internal/products/prices/repos/priceRepo.js";
import {
	hasEmptyStripeResource,
	isReusablePrepaidPrice,
	isReusableUsagePrice,
} from "./hasEmptyStripeResource.js";
import { evaluateUsableStripePrice } from "./isUsableStripePrice.js";
import { stampAttachCurrencyStripeSlot } from "./stampAttachCurrencyStripeSlot.js";

const reuseSlot = ({ targetPrice }: { targetPrice: Price }) =>
	isReusablePrepaidPrice(targetPrice)
		? "stripe_prepaid_price_v2_id"
		: "stripe_price_id";

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
}): Promise<StripePriceReuseEntry | null> => {
	const reusable =
		isFixedPrice(targetPrice) ||
		isReusablePrepaidPrice(targetPrice) ||
		isReusableUsagePrice(targetPrice);
	if (!reusable) return null;

	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();
	const { amount } = priceConfigForCurrency({
		config: targetPrice.config,
		currency,
		orgDefault: orgDefaultCurrency,
	});
	const base = {
		currency,
		product,
		targetPrice,
		targetAmount: amount,
		targetInterval: targetPrice.config.interval,
	} satisfies Partial<StripePriceReuseEntry>;

	if (!hasEmptyStripeResource({ ctx, targetPrice, currency })) {
		return {
			...base,
			result: "skipped",
			reason: "slot-set",
			stripePriceId: getPriceCurrencyStripeId({
				config: targetPrice.config as CurrencyAwarePriceConfig,
				currency,
				orgDefault: orgDefaultCurrency,
				slot: reuseSlot({ targetPrice }),
			}),
		};
	}

	const candidate = await findNewestReusableCandidate({
		ctx,
		targetPrice,
		productId: product.id,
		targetCurrency: currency,
	});
	if (!candidate) {
		return { ...base, result: "no-candidate" };
	}

	const candidateStripePriceId = getPriceCurrencyStripeId({
		config: candidate.config as CurrencyAwarePriceConfig,
		currency,
		orgDefault: orgDefaultCurrency,
		slot: reuseSlot({ targetPrice }),
	});
	const withCandidate = {
		...base,
		candidatePrice: candidate,
		candidateStripePriceId,
	};

	const reuseLevel = getPriceStripeReuseLevel({
		newPrice: targetPrice,
		candidatePrice: candidate,
		newEntitlements: [],
		candidateEntitlements: [],
	});
	if (reuseLevel !== "full") {
		return {
			...withCandidate,
			result: "reuse-level",
			reason: reuseLevel,
			reuseLevel,
		};
	}

	const usable = await evaluateUsableStripePrice({
		ctx,
		targetPrice,
		candidate,
		product,
		currency,
	});
	if (!usable.usable) {
		return {
			...withCandidate,
			result: "unusable",
			reason: usable.reason,
			reuseLevel,
			expectedStripeProductId: usable.expectedStripeProductId,
			retrievedStripeProductId: usable.retrievedStripeProductId,
			stripePriceId: usable.stripePriceId,
		};
	}

	await stampAttachCurrencyStripeSlot({
		ctx,
		targetPrice,
		sourcePrice: candidate,
		currency,
		slot: reuseSlot({ targetPrice }),
	});

	return {
		...withCandidate,
		result: "stamped",
		reuseLevel,
		expectedStripeProductId: usable.expectedStripeProductId,
		retrievedStripeProductId: usable.retrievedStripeProductId,
		stripePriceId: usable.stripePriceId,
	};
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
	const entries = await Promise.all(
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

	for (const entry of entries) {
		if (entry) logStripePriceReuse({ ctx, entry });
	}
};
