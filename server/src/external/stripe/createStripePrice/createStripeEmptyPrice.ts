import {
	type Organization,
	type Price,
	type Product,
	setPriceCurrencyStripeId,
	type UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import type Stripe from "stripe";
import { billingIntervalToStripe } from "../stripePriceUtils";

// Zero-amount licensed price paired with an in-arrear price (checkout flows).
// Non-fatal on failure, matching the original inline behavior.
export const createStripeEmptyPrice = async ({
	db,
	stripeCli,
	price,
	product,
	org,
	logger,
	currency: targetCurrency,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	price: Price;
	product: Product;
	org: Organization;
	logger: {
		info: (msg: string) => void;
		error: (msg: string, data?: unknown) => void;
	};
	currency?: string;
}) => {
	const config = price.config as UsagePriceConfig;
	const orgDefault = (org.default_currency || "usd").toLowerCase();
	const currency = (
		targetCurrency ??
		config.base_currency ??
		orgDefault
	).toLowerCase();

	try {
		logger.info(`Creating stripe empty price`);
		const emptyPrice = await stripeCli.prices.create({
			product: config.stripe_product_id || product.processor?.id,
			unit_amount: 0,
			currency,
			recurring: billingIntervalToStripe({
				interval: price.config!.interval!,
				intervalCount: price.config!.interval_count!,
			}) as Stripe.PriceCreateParams.Recurring,
		});

		setPriceCurrencyStripeId({
			config,
			currency,
			orgDefault,
			slot: "stripe_empty_price_id",
			id: emptyPrice.id,
		});
		await PriceService.update({
			db,
			id: price.id!,
			update: { config },
		});
	} catch (error) {
		logger.error(`Error creating stripe empty price!`, {
			error,
		});
	}
};
