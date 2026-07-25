import type {
	DbPooledBalanceContribution,
	FullCustomerEntitlement,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";
import { addSafe, subtractSafe } from "@autumn/shared";
import { generateId } from "@/utils/genUtils";
import type { MutablePooledCustomerEntitlement } from "../types/pooledBalanceComputeTypes";

export const addToUpdatePoolBalances = ({
	pooledBalancePlan,
	pooledCustomerEntitlement,
	balance,
	granted,
}: {
	pooledBalancePlan: PooledBalancePlan;
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
	balance: number;
	granted: number;
}) => {
	const balanceDelta = subtractSafe({
		left: balance,
		right: pooledCustomerEntitlement.balance,
	});
	const grantedDelta = subtractSafe({
		left: granted,
		right: pooledCustomerEntitlement.pooled_balance.granted,
	});
	pooledCustomerEntitlement.balance = balance;
	pooledCustomerEntitlement.pooled_balance.granted = granted;

	const isInsertedInPlan = pooledBalancePlan.insertPoolBalances.some(
		(insertedPooledCustomerEntitlement) =>
			insertedPooledCustomerEntitlement.id === pooledCustomerEntitlement.id,
	);
	if (isInsertedInPlan) return;

	const existingUpdateIndex = pooledBalancePlan.updatePoolBalances.findIndex(
		(update) =>
			update.pooledCustomerEntitlement.id === pooledCustomerEntitlement.id,
	);
	if (existingUpdateIndex === -1) {
		pooledBalancePlan.updatePoolBalances.push({
			pooledCustomerEntitlement,
			balanceDelta,
			grantedDelta,
		});
		return;
	}

	const existingUpdate =
		pooledBalancePlan.updatePoolBalances[existingUpdateIndex];
	pooledBalancePlan.updatePoolBalances[existingUpdateIndex] = {
		pooledCustomerEntitlement,
		balanceDelta: addSafe({
			left: existingUpdate.balanceDelta,
			right: balanceDelta,
		}),
		grantedDelta: addSafe({
			left: existingUpdate.grantedDelta,
			right: grantedDelta,
		}),
	};
};

export const addToInsertPoolContributions = ({
	pooledBalancePlan,
	contribution,
}: {
	pooledBalancePlan: PooledBalancePlan;
	contribution: InsertPooledBalanceContribution;
}) => {
	pooledBalancePlan.insertPoolContributions.push(contribution);
};

export const addToDeletePoolContributions = ({
	pooledBalancePlan,
	contribution,
}: {
	pooledBalancePlan: PooledBalancePlan;
	contribution: DbPooledBalanceContribution;
}) => {
	pooledBalancePlan.deletePoolContributions.push(contribution);
};

/** Rollovers ride the same path as the source's balance: the pool absorbs them,
 * and the source's own rows are left behind to expire with its cusProduct. */
export const carrySourceRolloversToPool = ({
	pooledBalancePlan,
	contributionCustomerEntitlement,
	pooledCustomerEntitlement,
}: {
	pooledBalancePlan: PooledBalancePlan;
	contributionCustomerEntitlement: FullCustomerEntitlement;
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
}) => {
	for (const rollover of contributionCustomerEntitlement.rollovers ?? []) {
		const carried = {
			...rollover,
			id: generateId("roll"),
			cus_ent_id: pooledCustomerEntitlement.id,
		};
		pooledCustomerEntitlement.rollovers.push(carried);
		pooledBalancePlan.insertPoolRollovers.push(carried);
	}
};

export const addToExpirePoolBalanceCandidates = ({
	pooledBalancePlan,
	pooledCustomerEntitlement,
	expiresAt,
}: {
	pooledBalancePlan: PooledBalancePlan;
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
	expiresAt: number;
}) => {
	const alreadyCandidate = pooledBalancePlan.expirePoolBalanceCandidates.some(
		(candidate) =>
			candidate.pooledCustomerEntitlement.id === pooledCustomerEntitlement.id,
	);
	if (alreadyCandidate) return;

	pooledBalancePlan.expirePoolBalanceCandidates.push({
		pooledCustomerEntitlement,
		expiresAt,
	});
};
