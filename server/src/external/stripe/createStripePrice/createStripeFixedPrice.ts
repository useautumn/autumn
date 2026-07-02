import type {
	FixedPriceConfig,
	Organization,
	Price,
	Product,
} from "@autumn/shared";
import {
	atmnToStripeAmount,
	priceConfigForCurrency,
	setPriceCurrencyStripeId,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import type Stripe from "stripe";
import { billingIntervalToStripe } from "../stripePriceUtils";

export const createStripeFixedPrice = async ({
	db,
	stripeCli,
	price,
	product,
	org,
	currency: targetCurrency,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	price: Price;
	product: Product;
	org: Organization;
	currency?: string;
}) => {
	const config = price.config as FixedPriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	const { amount: currencyAmount } = priceConfigForCurrency({
		config,
		currency,
		orgDefault,
	});

	const amount = atmnToStripeAmount({
		amount: currencyAmount ?? config.amount,
		currency,
	});

	const stripePrice = await stripeCli.prices.create({
		product: product.processor!.id,
		unit_amount: amount,
		currency,
		recurring: {
			...(billingIntervalToStripe({
				interval: config.interval,
				intervalCount: config.interval_count,
			}) as any),
		},

		nickname: `Autumn Price (Fixed)`,
	});

	setPriceCurrencyStripeId({
		config,
		currency,
		orgDefault,
		slot: "stripe_price_id",
		id: stripePrice.id,
	});
	config.stripe_product_id = stripePrice.product as string;

	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
