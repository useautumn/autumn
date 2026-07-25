import type {
	DbPooledBalanceContribution,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";
import { addSafe, subtractSafe } from "@autumn/shared";
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
