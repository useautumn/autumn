import { expect } from "bun:test";
import { type AppEnv, type Price, prices } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import { ProductService } from "@/internal/products/ProductService";

const stripeIdFields = [
	"stripe_price_id",
	"stripe_product_id",
	"stripe_empty_price_id",
	"stripe_meter_id",
	"stripe_prepaid_price_v2_id",
] as const;

const expectPriceHasNoStripeIds = (price: Price) => {
	const config = price.config as Record<string, unknown>;
	for (const field of stripeIdFields) {
		expect(config[field] ?? null).toBeNull();
	}
};

export const expectNoStripeResources = async ({
	db,
	orgId,
	env,
	productId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	productId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db,
		idOrInternalId: productId,
		orgId,
		env,
	});

	expect(fullProduct.processor?.id ?? null).toBeNull();

	for (const price of fullProduct.prices) {
		expectPriceHasNoStripeIds(price);
	}

	const allPrices = (await db.query.prices.findMany({
		where: eq(prices.internal_product_id, fullProduct.internal_id),
	})) as Price[];

	for (const price of allPrices) {
		expectPriceHasNoStripeIds(price);
	}
};

export const expectNoCustomStripePrices = async ({
	db,
	internalProductId,
}: {
	db: DrizzleCli;
	internalProductId: string;
}) => {
	const customPrices = (await db.query.prices.findMany({
		where: eq(prices.internal_product_id, internalProductId),
	})) as Price[];

	for (const price of customPrices) {
		if (!price.is_custom) continue;
		expectPriceHasNoStripeIds(price);
	}
};
