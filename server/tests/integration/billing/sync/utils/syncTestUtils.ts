import type { FullProduct } from "@autumn/shared";
import { isFixedPrice } from "@autumn/shared";
import { v2BillingStripePriceId } from "@tests/integration/utils/expectStripePriceResources";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

export const createStripeSubscriptionFromProduct = async ({
	ctx,
	customerId,
	productId,
	metadata,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	metadata?: Stripe.MetadataParam;
}): Promise<Stripe.Subscription> => {
	return createStripeSubscriptionFromProducts({
		ctx,
		customerId,
		productIds: [productId],
		metadata,
	});
};

export const createStripeSubscriptionFromProducts = async ({
	ctx,
	customerId,
	productIds,
	metadata,
}: {
	ctx: TestContext;
	customerId: string;
	productIds: string[];
	metadata?: Stripe.MetadataParam;
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
		metadata,
	});
};

export const getAllStripePriceIds = ({
	fullProduct,
}: {
	fullProduct: FullProduct;
}): string[] => {
	const priceIds: string[] = [];

	for (const price of fullProduct.prices) {
		const stripePriceId =
			v2BillingStripePriceId({ price, product: fullProduct }) ??
			price.config.stripe_empty_price_id;
		if (stripePriceId) priceIds.push(stripePriceId);
	}

	return priceIds;
};

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
