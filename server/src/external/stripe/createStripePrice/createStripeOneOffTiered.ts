import type {
	EntitlementWithFeature,
	Price,
	Product,
	UsagePriceConfig,
} from "@autumn/shared";
import type { DrizzleCli } from "@server/db/initDrizzle";
import { PriceService } from "@server/internal/products/prices/PriceService";
import type Stripe from "stripe";

export const createStripeOneOffTieredProduct = async ({
	db,
	price,
	stripeProductId,
}: {
	db: DrizzleCli;
	stripeCli: Stripe;
	price: Price;
	entitlements: EntitlementWithFeature[];
	product: Product;
	stripeProductId: string;
}) => {
	const config = price.config as UsagePriceConfig;
	config.stripe_product_id = stripeProductId;

	await PriceService.update({
		db,
		id: price.id!,
		update: { config },
	});
};
