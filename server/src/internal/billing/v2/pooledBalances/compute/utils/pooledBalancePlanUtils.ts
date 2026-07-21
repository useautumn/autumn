import type {
  DbPooledBalanceContribution,
  InsertPooledBalanceContribution,
  PooledBalancePlan,
} from "@autumn/shared";
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
  pooledCustomerEntitlement.balance = balance;
  pooledCustomerEntitlement.pooled_balance.granted = granted;

  const isInsertedInPlan = pooledBalancePlan.insertPoolBalances.some(
    (insertedPooledCustomerEntitlement) =>
      insertedPooledCustomerEntitlement.id === pooledCustomerEntitlement.id,
  );
  if (isInsertedInPlan) return;

  const existingUpdateIndex = pooledBalancePlan.updatePoolBalances.findIndex(
    (updatedPooledCustomerEntitlement) =>
      updatedPooledCustomerEntitlement.id === pooledCustomerEntitlement.id,
  );
  if (existingUpdateIndex === -1) {
    pooledBalancePlan.updatePoolBalances.push(pooledCustomerEntitlement);
    return;
  }

  pooledBalancePlan.updatePoolBalances[existingUpdateIndex] =
    pooledCustomerEntitlement;
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
