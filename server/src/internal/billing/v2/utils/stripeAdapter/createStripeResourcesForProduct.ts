import type { FullCustomer, FullProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createStripePriceIFNotExist } from "@/external/stripe/createStripePrice/createStripePrice";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkStripeProductExists } from "@/internal/products/productUtils";

export const createStripeResourcesForProducts = async ({
	ctx,
	fullProducts,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullProducts: FullProduct[];
	fullCustomer: FullCustomer;
}) => {
	const { db, org, env, logger } = ctx;

	const batchProductUpdates = [];
	for (const product of fullProducts) {
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

	for (const product of fullProducts) {
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
