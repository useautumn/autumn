import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutumnBillingPlan } from "@autumn/shared";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct.js";
import type { CreateCustomerContext } from "../createCustomerContext.js";

/**
 * Compute the Autumn billing plan for customer creation.
 * Builds customer products from default products.
 */
export const computeCreateCustomerPlan = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: CreateCustomerContext;
}): AutumnBillingPlan => {
	const { fullCustomer, fullProducts, currentEpochMs } = context;

	const insertCustomerProducts = fullProducts.map((product) =>
		initFullCustomerProductFromProduct({
			ctx,
			initContext: {
				fullCustomer,
				fullProduct: product,
				currentEpochMs,
			},
		}),
	);

	context.fullCustomer.customer_products = insertCustomerProducts;

	return { insertCustomerProducts };
};
