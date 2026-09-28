import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan.js";
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

	// A default plan mints pools like any other attach. Runs before the products
	// are handed to the customer, since it fills their pooled balances in place.
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		incomingCustomerProducts: insertCustomerProducts,
		now: currentEpochMs,
	});

	context.fullCustomer.customer_products = insertCustomerProducts;

	return {
		customerId: fullCustomer?.id ?? "",
		insertCustomerProducts,
		pooledBalancePlan,
	};
};
