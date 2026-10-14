import {
	type AutumnBillingPlan,
	isProductPaidAndRecurring,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan.js";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct.js";
import type { CreateCustomerContext } from "../createCustomerContext.js";

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
				onTrialEnd:
					product.free_trial?.card_required === false &&
					isProductPaidAndRecurring(product)
						? product.free_trial.on_end === "revert"
							? "revert"
							: "bill"
						: undefined,
			},
		}),
	);

	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		incomingCustomerProducts: insertCustomerProducts,
		now: currentEpochMs,
	});

	context.fullCustomer.customer_products = insertCustomerProducts;

	return {
		customerId: fullCustomer?.id ?? "",
		insertCustomer: fullCustomer,
		insertCustomerProducts,
		pooledBalancePlan,
	};
};
