import {
	type AutumnBillingPlan,
	type BillingContext,
	cusProductToProduct,
	nullish,
} from "@autumn/shared";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkStripeProductExists } from "@/internal/products/productUtils";

export const initStripeResourcesForBillingPlan = async ({
	ctx,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: BillingContext;
}) => {
	const { db, org, env, logger } = ctx;

	const { fullCustomer } = billingContext;
	const { insertCustomerProducts } = autumnBillingPlan;

	const newProducts = insertCustomerProducts.flatMap((cp) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	const existingProducts = fullCustomer.customer_products
		.map((customerProduct) =>
			cusProductToProduct({ cusProduct: customerProduct }),
		)
		.map((product) => ({
			...product,
			prices: product.prices.filter(
				(price) =>
					nullish(price.config.stripe_price_id) ||
					("stripe_prepaid_price_v2_id" in price.config &&
						nullish(price.config.stripe_prepaid_price_v2_id)),
			),
		}))
		.filter(
			(product) => nullish(product.processor?.id) || product.prices.length > 0,
		);

	const allProducts = [...newProducts, ...existingProducts];

	const batchProductUpdates = [];
	for (const product of allProducts) {
		if (product.processor?.id != null) continue;

		batchProductUpdates.push(
			checkStripeProductExists({
				db,
				org,
				env,
				product,
				logger,
			}),
		);
	}
	await Promise.all(batchProductUpdates);

	const batchPriceUpdates = [];

	const internalEntityId = fullCustomer.entity?.internal_id;

	for (const product of allProducts) {
		for (const price of product.prices) {
			batchPriceUpdates.push(
				createStripePriceIFNotExist({
					ctx,
					price,
					entitlements: product.entitlements,
					product,
					internalEntityId,
					useCheckout: false,
				}),
			);
		}
	}
	await Promise.all(batchPriceUpdates);
};
