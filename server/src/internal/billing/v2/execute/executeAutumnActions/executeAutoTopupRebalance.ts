import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutoTopupRebalanceDelta } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import { customerEntitlementActions } from "@/internal/customers/cusProducts/cusEnts/actions/index.js";

/**
 * Apply pre-computed auto top-up rebalance deltas. Each delta is an atomic SQL
 * `balance + delta` increment (+ Redis JSON.NUMINCRBY), so concurrent deductions
 * between compute and execute are preserved.
 *
 * The deltas themselves are computed earlier by `computeRebalancedAutoTopUp` from
 * the context's FullCustomer snapshot; this executor step is purely mechanical.
 */
export const executeAutoTopupRebalance = async ({
	ctx,
	customerId,
	deltas,
}: {
	ctx: AutumnContext;
	customerId: string;
	deltas: AutoTopupRebalanceDelta[];
}): Promise<void> => {
	for (const { cusEntId, featureId, delta } of deltas) {
		if (delta === 0) continue;

		await customerEntitlementActions.adjustBalanceDbAndCache({
			ctx,
			customerId,
			cusEntId,
			featureId,
			delta,
		});
	}
};
