import type { FullProduct } from "@autumn/shared";
import { isFixedPrice } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

/**
 * Creates a Stripe subscription using the REAL Stripe price IDs stored on
 * the Autumn product's prices (fixed or usage). This mirrors what a real
 * customer's Stripe subscription would look like — the price IDs will
 * reverse-match through PriceService.getByStripeIds during sync proposals.
 */
export const createStripeSubscriptionFromProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}): Promise<Stripe.Subscription> => {
	return createStripeSubscriptionFromProducts({
		ctx,
		customerId,
		productIds: [productId],
	});
};

/**
 * Creates a single Stripe subscription from multiple Autumn products.
 * Gathers all Stripe price IDs across the given products and creates
 * one subscription with all items.
 */
export const createStripeSubscriptionFromProducts = async ({
	ctx,
	customerId,
	productIds,
}: {
	ctx: TestContext;
	customerId: string;
	productIds: string[];
}): Promise<Stripe.Subscription> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}

	const fullProducts = await Promise.all(
		productIds.map((productId) =>
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: productId,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		),
	);

	const stripePriceIds = fullProducts.flatMap((fullProduct) =>
		getAllStripePriceIds({ fullProduct }),
	);
	if (stripePriceIds.length === 0) {
		throw new Error(
			`Products [${productIds.join(", ")}] have no prices with stripe_price_id`,
		);
	}

	return ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: stripePriceIds.map((priceId) => ({ price: priceId })),
	});
};

/**
 * Extracts all stripe_price_id values from a product's prices (fixed and usage).
 * Falls back to stripe_empty_price_id if the main one is missing.
 */
export const getAllStripePriceIds = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): string[] => {
	const priceIds: string[] = [];

	for (const price of fullProduct.prices) {
		const stripePriceId =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (stripePriceId) priceIds.push(stripePriceId);
	}

	return priceIds;
};

/**
 * Extracts stripe_price_id values from fixed prices only.
 */
export const getStripePriceIdsFromProduct = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): string[] => {
	const priceIds: string[] = [];

	for (const price of fullProduct.prices) {
		if (!isFixedPrice(price)) continue;

		const stripePriceId =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (stripePriceId) priceIds.push(stripePriceId);
	}

	return priceIds;
};

/**
 * Gets the first fixed-price stripe_price_id from a product.
 * Useful when you just need one ID for assertions.
 */
export const getFirstStripePriceId = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): string => {
	const ids = getStripePriceIdsFromProduct({ fullProduct });
	if (ids.length === 0) {
		throw new Error("No stripe_price_id found on product");
	}
	return ids[0];
};
