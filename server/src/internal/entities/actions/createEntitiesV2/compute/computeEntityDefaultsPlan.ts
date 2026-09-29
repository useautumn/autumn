import type { AutumnBillingPlan, FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan.js";
import { initFullCustomerProductFromProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromProduct.js";
import type { CreateEntitiesContext } from "../types/createEntitiesContext.js";

/** Each new entity starts on the org's free entity defaults; their pooled grants join the customer's pools in the same plan. */
export const computeEntityDefaultsPlan = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: CreateEntitiesContext;
}): Pick<AutumnBillingPlan, "insertCustomerProducts" | "pooledBalancePlan"> => {
	const { fullCustomer, insertedEntities, defaultProducts, currentEpochMs } =
		context;

	const insertCustomerProducts: FullCusProduct[] = insertedEntities.flatMap(
		(entity) =>
			defaultProducts.map((fullProduct) =>
				initFullCustomerProductFromProduct({
					ctx,
					initContext: {
						fullCustomer: {
							...fullCustomer,
							entity,
							entities: insertedEntities,
						},
						fullProduct,
						currentEpochMs,
					},
				}),
			),
	);

	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		incomingCustomerProducts: insertCustomerProducts,
		now: currentEpochMs,
	});

	return { insertCustomerProducts, pooledBalancePlan };
};
