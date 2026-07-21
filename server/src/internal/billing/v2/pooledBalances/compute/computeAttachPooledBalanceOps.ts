import type { FullCusProduct, PooledBalanceOp } from "@autumn/shared";
import { pooledBalancePlanToOps } from "@/internal/billing/v2/pooledBalances/utils/pooledBalancePlanToOps.js";
import { computeAttachPooledBalancePlan } from "./computeAttachPooledBalancePlan/computeAttachPooledBalancePlan.js";

// Legacy ops-shaped facade over computeAttachPooledBalancePlan; migrate callers to the plan form.
export const computeAttachPooledBalanceOps = (
	args: Parameters<typeof computeAttachPooledBalancePlan>[0],
): {
	customerProduct: FullCusProduct;
	pooledBalanceOps: PooledBalanceOp[];
} => {
	const { customerProduct, pooledBalancePlan } =
		computeAttachPooledBalancePlan(args);

	return {
		customerProduct,
		pooledBalanceOps: pooledBalancePlanToOps({ pooledBalancePlan }),
	};
};
