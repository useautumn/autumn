import {
	customerEntitlements,
	entitlements,
	type InsertCustomerEntitlement,
	type InsertDbEntitlement,
	InternalError,
	type PooledBalancePlan,
	pooledBalanceContributions,
	pooledBalances,
	rollovers,
} from "@autumn/shared";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { pooledBalancePlanHasChanges } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan";

/** Persists a computed pooled-balance plan. The one exception to "no reads" is
 * pool expiry, which must check the unbounded contribution count in the DB. */
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
			// A source entitlement holds at most one contribution. If a transition
			// mis-classifies an already-contributing product as incoming, reconcile
			// onto the existing row rather than failing the whole request.
			const writtenContributions = await tx
				.insert(pooledBalanceContributions)
				.values(pooledBalancePlan.insertPoolContributions)
				.onConflictDoUpdate({
					target: pooledBalanceContributions.source_customer_entitlement_id,
					set: {
						pooled_balance_id: sql`excluded.pooled_balance_id`,
						source_customer_product_id: sql`excluded.source_customer_product_id`,
						current_contribution: sql`excluded.current_contribution`,
						next_cycle_contribution: sql`excluded.next_cycle_contribution`,
						effective_at: sql`excluded.effective_at`,
						updated_at: sql`excluded.updated_at`,
					},
				})
				.returning({
					id: pooledBalanceContributions.id,
					sourceCustomerEntitlementId:
						pooledBalanceContributions.source_customer_entitlement_id,
				});

			const plannedContributionIds = new Set(
				pooledBalancePlan.insertPoolContributions.map(
					(contribution) => contribution.id,
				),
			);
			const reconciled = writtenContributions.filter(
				(row) => !plannedContributionIds.has(row.id),
			);
			if (reconciled.length > 0) {
				ctx.logger.warn(
					`[executePooledBalancePlan] Reconciled ${reconciled.length} pooled contribution(s) onto existing rows — a transition treated an already-contributing source as incoming`,
					{
						data: {
							sourceCustomerEntitlementIds: reconciled.map(
								(row) => row.sourceCustomerEntitlementId,
							),
						},
					},
				);
			}

			// Point each source at the row that actually exists, which is the
			// pre-existing contribution whenever the conflict path fired.
			const contributionIdBySource = new Map(
				writtenContributions.map((row) => [
					row.sourceCustomerEntitlementId,
					row.id,
				]),
			);
			for (const contribution of pooledBalancePlan.insertPoolContributions) {
				await tx
					.update(customerEntitlements)
					.set({
						pooled_contribution_id:
							contributionIdBySource.get(
								contribution.source_customer_entitlement_id,
							) ?? contribution.id,
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

		if (pooledBalancePlan.insertPoolRollovers.length > 0) {
			await tx
				.insert(rollovers)
				.values(pooledBalancePlan.insertPoolRollovers)
				.onConflictDoNothing();
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

		// Runs last: contributions are already deleted, so "no rows left" inside
		// this transaction is the authoritative answer.
		for (const {
			pooledCustomerEntitlement,
			expiresAt,
		} of pooledBalancePlan.expirePoolBalanceCandidates) {
			const poolId = pooledCustomerEntitlement.pooled_balance_id;
			if (!poolId) continue;

			const hasNoContributions = notExists(
				tx
					.select({ exists: sql`1` })
					.from(pooledBalanceContributions)
					.where(eq(pooledBalanceContributions.pooled_balance_id, poolId)),
			);

			await tx
				.update(customerEntitlements)
				.set({
					expires_at: expiresAt,
					cache_version: sql`${customerEntitlements.cache_version} + 1`,
				})
				.where(
					and(
						eq(customerEntitlements.id, pooledCustomerEntitlement.id),
						hasNoContributions,
					),
				);

			// Frees the identity for a future attach — uniqueness covers live pools only.
			await tx
				.update(pooledBalances)
				.set({ expires_at: expiresAt, updated_at: expiresAt })
				.where(and(eq(pooledBalances.id, poolId), hasNoContributions));
		}

		for (const fullCustomerEntitlement of pooledBalancePlan.deletePoolBalances ??
			[]) {
			const pooledBalance = fullCustomerEntitlement.pooled_balance;
			if (!pooledBalance) {
				throw new InternalError({
					message: `Synthetic customer entitlement '${fullCustomerEntitlement.id}' is missing its pooled balance.`,
				});
			}

			const poolContributionIds = tx
				.select({ id: pooledBalanceContributions.id })
				.from(pooledBalanceContributions)
				.where(
					eq(pooledBalanceContributions.pooled_balance_id, pooledBalance.id),
				);
			await tx
				.update(customerEntitlements)
				.set({ pooled_contribution_id: null })
				.where(
					inArray(
						customerEntitlements.pooled_contribution_id,
						poolContributionIds,
					),
				);

			// Contributions cascade with the pool row; the synthetic cusEnt is
			// restrict-protected until the pool row is gone, so this order is required.
			await tx
				.delete(pooledBalances)
				.where(eq(pooledBalances.id, pooledBalance.id));
			await tx
				.delete(customerEntitlements)
				.where(eq(customerEntitlements.id, fullCustomerEntitlement.id));
			await tx
				.delete(entitlements)
				.where(eq(entitlements.id, fullCustomerEntitlement.entitlement_id));
		}
	});
};
