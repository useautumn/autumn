import type {
	EntitlementWithFeature,
	Price,
	Product,
	UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import { getPriceEntitlement } from "@server/internal/products/prices/priceUtils";
import type Stripe from "stripe";

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
