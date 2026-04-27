import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerEntitlementActions } from "@/internal/customers/cusProducts/cusEnts/actions/index.js";

export type AutoTopupRebalanceDelta = {
	cusEntId: string;
	delta: number;
};

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
	for (const { cusEntId, delta } of deltas) {
		if (delta === 0) continue;

		await customerEntitlementActions.adjustBalanceDbAndCache({
			ctx,
			customerId,
			cusEntId,
			delta,
		});
	}
};
