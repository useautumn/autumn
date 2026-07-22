import {
	addCusProductToCusEnt,
	cusEntToStartingBalance,
	type FullCusProduct,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import type { PooledBalanceContributionAmounts } from "../types/pooledBalanceComputeTypes";

export const computePooledBalanceContributionAmounts = ({
	contributionCustomerEntitlement,
	customerProduct,
}: {
	contributionCustomerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
}): PooledBalanceContributionAmounts => {
	const customerEntitlementWithProduct = addCusProductToCusEnt({
		cusEnt: contributionCustomerEntitlement,
		cusProduct: customerProduct,
	});

	return {
		currentContribution: cusEntToStartingBalance({
			cusEnt: customerEntitlementWithProduct,
		}),
		nextCycleContribution: cusEntToStartingBalance({
			cusEnt: customerEntitlementWithProduct,
			useUpcomingQuantity: true,
		}),
	};
};
