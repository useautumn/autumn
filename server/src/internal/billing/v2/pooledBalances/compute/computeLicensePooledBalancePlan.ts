import type {
	CustomerLicenseTransition,
	FullCusProduct,
	FullCustomer,
	PooledBalancePlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyLicensePooledBalances } from "./applyLicensePooledBalances/applyLicensePooledBalances";
import { setupPooledBalanceComputeContext } from "./context/setupPooledBalanceComputeContext";
import { finalizePooledBalanceTransitionPlan } from "./finalizePooledBalanceTransitionPlan";

export const computeLicensePooledBalancePlan = ({
	ctx,
	fullCustomer,
	parentCustomerProduct,
	customerLicenseTransitions,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	parentCustomerProduct: FullCusProduct;
	customerLicenseTransitions?: CustomerLicenseTransition[];
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
		customerLicenseTransitions,
		customerCreatedAt: fullCustomer.created_at,
		now,
	});

	return finalizePooledBalanceTransitionPlan({ computeContext, now });
};
