import {
	customerEntitlements,
	entitlements,
	type InsertCustomerEntitlement,
	type InsertDbEntitlement,
	InternalError,
	type PooledBalancePlan,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { eq, inArray, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { pooledBalancePlanHasChanges } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";

/** Persists a fully computed pooled-balance plan without reading or recomputing state. */
export const executePooledBalancePlan = async ({
	ctx,
	pooledBalancePlan,
}: {
	ctx: AutumnContext;
	pooledBalancePlan?: PooledBalancePlan;
}) => {
	if (
		!pooledBalancePlan ||
		!pooledBalancePlanHasChanges({ pooledBalancePlan })
	) {
		return;
	}

	await ctx.db.transaction(async (tx) => {
		for (const fullCustomerEntitlement of pooledBalancePlan.insertPoolBalances) {
			const {
				entitlement: fullEntitlement,
				replaceables: _replaceables,
				rollovers: _rollovers,
				pooled_balance: pooledBalance,
				pooled_balance_contribution: _pooledBalanceContribution,
				...customerEntitlement
			} = fullCustomerEntitlement;

			if (!pooledBalance) {
				throw new InternalError({
					message: `Synthetic customer entitlement '${customerEntitlement.id}' is missing its pooled balance.`,
				});
			}

			const { feature: _feature, ...fullEntitlementFields } = fullEntitlement;
			const entitlement: InsertDbEntitlement = fullEntitlementFields;
			const syntheticCustomerEntitlement: InsertCustomerEntitlement = {
				...customerEntitlement,
				balance: customerEntitlement.balance ?? 0,
				pooled_balance_id: pooledBalance.id,
				pooled_contribution_id: null,
			};
			await tx.insert(entitlements).values(entitlement);
			await tx
				.insert(customerEntitlements)
				.values(syntheticCustomerEntitlement);
			await tx.insert(pooledBalances).values(pooledBalance);
		}

		for (const {
			pooledCustomerEntitlement: fullCustomerEntitlement,
			balanceDelta,
			grantedDelta,
		} of pooledBalancePlan.updatePoolBalances) {
			const pooledBalance = fullCustomerEntitlement.pooled_balance;
			if (!pooledBalance) {
				throw new InternalError({
					message: `Synthetic customer entitlement '${fullCustomerEntitlement.id}' is missing its pooled balance.`,
				});
			}

			await tx
				.update(customerEntitlements)
				.set({
					balance: sql`COALESCE(${customerEntitlements.balance}, 0) + ${balanceDelta}`,
					cache_version: sql`${customerEntitlements.cache_version} + 1`,
				})
				.where(eq(customerEntitlements.id, fullCustomerEntitlement.id));

			await tx
				.update(pooledBalances)
				.set({
					granted: sql`COALESCE(${pooledBalances.granted}, 0) + ${grantedDelta}`,
					reset_cycle_anchor: pooledBalance.reset_cycle_anchor,
					stripe_subscription_id: pooledBalance.stripe_subscription_id,
					customer_license_link_id: pooledBalance.customer_license_link_id,
					updated_at: Date.now(),
				})
				.where(eq(pooledBalances.id, pooledBalance.id));
		}

		if (pooledBalancePlan.insertPoolContributions.length > 0) {
			await tx
				.insert(pooledBalanceContributions)
				.values(pooledBalancePlan.insertPoolContributions);

			for (const contribution of pooledBalancePlan.insertPoolContributions) {
				await tx
					.update(customerEntitlements)
					.set({
						pooled_contribution_id: contribution.id,
						pooled_balance_id: null,
						balance: 0,
						adjustment: 0,
						additional_balance: 0,
						entities: null,
					})
					.where(
						eq(
							customerEntitlements.id,
							contribution.source_customer_entitlement_id,
						),
					);
			}
		}

		for (const contribution of pooledBalancePlan.updatePoolContributions) {
			await tx
				.update(pooledBalanceContributions)
				.set({
					pooled_balance_id: contribution.pooled_balance_id,
					current_contribution: contribution.current_contribution,
					next_cycle_contribution: contribution.next_cycle_contribution,
					effective_at: contribution.effective_at,
					updated_at: contribution.updated_at,
				})
				.where(eq(pooledBalanceContributions.id, contribution.id));
		}

		const contributionIds = pooledBalancePlan.deletePoolContributions.map(
			(contribution) => contribution.id,
		);
		if (contributionIds.length > 0) {
			await tx
				.update(customerEntitlements)
				.set({ pooled_contribution_id: null })
				.where(
					inArray(customerEntitlements.pooled_contribution_id, contributionIds),
				);

			await tx
				.delete(pooledBalanceContributions)
				.where(inArray(pooledBalanceContributions.id, contributionIds));
		}
	});
};
