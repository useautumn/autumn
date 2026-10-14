import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AutoTopupRebalanceDelta } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp.js";
import { customerEntitlementActions } from "@/internal/customers/cusProducts/cusEnts/actions/index.js";

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
