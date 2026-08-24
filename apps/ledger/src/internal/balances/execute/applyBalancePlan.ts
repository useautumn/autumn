import { customerEntitlementStore } from "../../../sqlite/customerEntitlements/store/customerEntitlementStore.js";
import { subjectVersionStore } from "../../../sqlite/subjectVersions/store/subjectVersionStore.js";
import type { ShardContext } from "../../shard/types/shardContext.js";
import type { BalanceContext } from "../types/balanceContext.js";
import type { BalancePlan } from "../types/balancePlan.js";

// A plan that moved nothing is not a fact about the subject: no rows change,
// the version stays put, and the journal gets no entry.
export const applyBalancePlan = ({
	ctx,
	balanceContext,
	plan,
}: {
	ctx: ShardContext;
	balanceContext: BalanceContext;
	plan: BalancePlan;
}): number | undefined => {
	if (plan.mutations.length === 0) return undefined;

	for (const [id, settled] of Object.entries(plan.after)) {
		customerEntitlementStore.updateBalance({
			ctx,
			id,
			balance: settled.balance,
			adjustment: settled.adjustment,
		});
	}

	return subjectVersionStore.bumpVersion({
		ctx,
		internalCustomerId: balanceContext.subject.customer.internal_id,
	});
};
