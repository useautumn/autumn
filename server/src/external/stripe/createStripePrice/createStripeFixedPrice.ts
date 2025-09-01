import type {
	FixedPriceConfig,
	Organization,
	Price,
	Product,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { billingIntervalToStripe } from "../stripePriceUtils.js";

export const createStripeFixedPrice = async ({
	db,
	stripeCli,
	price,
	product,
	org,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	price: Price;
	product: Product;
	org: Organization;
}) => {
	const config = price.config as FixedPriceConfig;

	const amount = new Decimal(config.amount).mul(100).toNumber();

	const stripePrice = await stripeCli.prices.create({
		product: product.processor?.id,
		unit_amount: amount,
		currency: org.default_currency!,
		recurring: {
			...(billingIntervalToStripe({
				interval: config.interval,
				intervalCount: config.interval_count,
			}) as any),
		},

		nickname: `Autumn Price (Fixed)`,
	});

	config.stripe_price_id = stripePrice.id;

	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
