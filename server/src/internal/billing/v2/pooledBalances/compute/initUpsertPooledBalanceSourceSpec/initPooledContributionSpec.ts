import {
	cusEntToStartingBalance,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	isFiniteNumber,
	type PooledContributionSpec,
} from "@autumn/shared";
import {
	type PooledResetPolicy,
	pooledResetPolicyToContributionOwner,
} from "@/internal/billing/v2/pooledBalances/utils/pooledResetPolicy.js";
import { throwUnsupportedPooledEntitlement } from "./throwUnsupportedPooledEntitlement.js";

export const initPooledContributionSpec = ({
	customerProduct,
	customerEntitlement,
	resetPolicy,
}: {
	customerProduct: FullCusProduct;
	customerEntitlement: FullCusEntWithFullCusProduct;
	resetPolicy: PooledResetPolicy;
}): PooledContributionSpec => {
	const { entitlement } = customerEntitlement;

	const currentCycleContribution = cusEntToStartingBalance({
		cusEnt: customerEntitlement,
	});
	const nextCycleContribution = cusEntToStartingBalance({
		cusEnt: customerEntitlement,
		useUpcomingQuantity: true,
	});
	if (
		!isFiniteNumber(currentCycleContribution) ||
		currentCycleContribution < 0 ||
		!isFiniteNumber(nextCycleContribution) ||
		nextCycleContribution < 0
	) {
		return throwUnsupportedPooledEntitlement({
			message: `Pooled feature '${entitlement.feature.id}' requires a finite, non-negative contribution grant.`,
		});
	}

	return {
		sourceCustomerProductId: customerProduct.id,
		sourceEntitlementId: entitlement.id,
		...pooledResetPolicyToContributionOwner({ resetPolicy }),
		currentCycleContribution,
		nextCycleContribution,
	};
};
