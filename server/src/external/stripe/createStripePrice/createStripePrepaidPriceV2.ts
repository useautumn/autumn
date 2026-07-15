import {
	ErrCode,
	type FullProduct,
	getPriceCurrencyStripeId,
	type Price,
	priceToEnt,
	priceUtils,
	RecaseError,
	setPriceCurrencyStripeId,
	type UsagePriceConfig,
} from "@autumn/shared";
import { PriceService } from "@server/internal/products/prices/PriceService";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const createStripePrepaidPriceV2 = async ({
	ctx,
	price,
	product,
	currentStripeProduct,
	currency: targetCurrency,
}: {
	ctx: AutumnContext;
	price: Price;
	product: FullProduct;
	currentStripeProduct?: Stripe.Product;
	currency?: string;
}) => {
	const { org, db, env } = ctx;

	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
	});

	// No allowance → V2 price is identical to V1. Reuse the same Stripe price.
	if (!entitlement?.allowance) {
		setPriceCurrencyStripeId({
			config,
			currency,
			orgDefault,
			slot: "stripe_prepaid_price_v2_id",
			id: getPriceCurrencyStripeId({
				config,
				currency,
				orgDefault,
				slot: "stripe_price_id",
			}),
		});
		price.config = config;

		await PriceService.update({
			db,
			id: price.id!,
			update: { config },
		});

		return;
	}

	if (entitlement.allowance % (price.config.billing_units ?? 1) !== 0) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message:
				"If you have a plan feature with both an included usage and a price, the included usage must be an amount that is divisible by the billing units.",
		});
	}

	const stripeCreatePriceParams = priceUtils.convert.toStripeCreatePriceParams({
		price,
		product,
		org,
		currentStripeProduct,
		currency,
	});

	const stripeCli = createStripeCli({ org, env });

	const stripePrice = await stripeCli.prices.create(stripeCreatePriceParams);

	setPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_prepaid_price_v2_id",
		id: stripePrice.id,
	});
	price.config = config;

	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
