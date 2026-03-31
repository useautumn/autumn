import type { AutumnBillingPlan, BillingContext } from "@autumn/shared";
import { cusProductToProduct } from "@autumn/shared";
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

	const existingProducts = fullCustomer.customer_products.map((cp) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	const allProducts = [...newProducts, ...existingProducts];

	const batchProductUpdates = [];
	for (const product of allProducts) {
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
