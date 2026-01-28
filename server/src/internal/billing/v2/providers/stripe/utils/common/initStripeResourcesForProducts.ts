import { cusProductToProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingContext } from "@/internal/billing/v2/types";
import type { AutumnBillingPlan } from "@/internal/billing/v2/types";
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

	// For each insert customer product
	const { fullCustomer } = billingContext;
	const { insertCustomerProducts } = autumnBillingPlan;

	const newProducts = insertCustomerProducts.flatMap((cp) =>
		cusProductToProduct({ cusProduct: cp }),
	);

	const batchProductUpdates = [];
	for (const product of newProducts) {
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

	const stripeCli = createStripeCli({
		org,
		env,
	});

	const internalEntityId = fullCustomer.entity?.internal_id;

	for (const product of newProducts) {
		for (const price of product.prices) {
			batchPriceUpdates.push(
				createStripePriceIFNotExist({
					db,
					stripeCli,
					price,
					entitlements: product.entitlements,
					product,
					org,
					logger,
					internalEntityId,
					useCheckout: false,
				}),
			);
		}
	}
	await Promise.all(batchPriceUpdates);
};
