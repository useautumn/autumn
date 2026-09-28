import type {
	FullCusProduct,
	FullCustomer,
	PooledBalancePlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyLicensePooledBalances } from "./applyLicensePooledBalances/applyLicensePooledBalances";
import { setupPooledBalanceComputeContext } from "./context/setupPooledBalanceComputeContext";
import { finalizePooledBalanceTransitionPlan } from "./finalizePooledBalanceTransitionPlan";

/** The license pools a parent's current licenses should hold — idempotent,
 * so re-running it against converged state yields no plan. */
export const computeLicensePooledBalancePlan = ({
	ctx,
	fullCustomer,
	parentCustomerProduct,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	parentCustomerProduct: FullCusProduct;
	now: number;
}): PooledBalancePlan | undefined => {
	const computeContext = setupPooledBalanceComputeContext({
		pooledCustomerEntitlements: fullCustomer.pooled_customer_entitlements ?? [],
	});

	applyLicensePooledBalances({
		ctx,
		computeContext,
		customerLicenses: parentCustomerProduct.customer_licenses ?? [],
		parentCustomerProducts: [parentCustomerProduct],
		customerCreatedAt: fullCustomer.created_at,
		now,
	});

	return finalizePooledBalanceTransitionPlan({ computeContext, now });
};
