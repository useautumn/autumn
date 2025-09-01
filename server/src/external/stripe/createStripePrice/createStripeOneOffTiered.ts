import type {
	EntitlementWithFeature,
	Price,
	Product,
	UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { getPriceEntitlement } from "@/internal/products/prices/priceUtils.js";

export const createStripeOneOffTieredProduct = async ({
	db,
	stripeCli,
	price,
	entitlements,
	product,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	price: Price;
	entitlements: EntitlementWithFeature[];
	product: Product;
}) => {
	const config = price.config as UsagePriceConfig;
	const relatedEnt = getPriceEntitlement(price, entitlements);
	const productName = `${product.name} - ${
		config.billing_units === 1 ? "" : `${config.billing_units} `
	}${relatedEnt.feature.name}`;

	const stripeProduct = await stripeCli.products.create({
		name: productName,
	});

	config.stripe_product_id = stripeProduct.id;

	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
