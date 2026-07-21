import type { PooledBalancePlan } from "@autumn/shared";
import { pooledBalancePlanHasChanges } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";

export const finalizePooledBalanceComputeContext = ({
	computeContext,
}: {
	computeContext: PooledBalanceComputeContext;
}): PooledBalancePlan | undefined => {
	return pooledBalancePlanHasChanges({
		pooledBalancePlan: computeContext.plan,
	})
		? computeContext.plan
		: undefined;
};
