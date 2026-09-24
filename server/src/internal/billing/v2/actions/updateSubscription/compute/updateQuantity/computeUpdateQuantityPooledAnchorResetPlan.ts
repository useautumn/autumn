import {
	type AutumnBillingPlan,
	addSafe,
	billingContextResetsUsage,
	findCustomerProductById,
	InternalError,
	PooledBalanceResetMode,
	subtractSafe,
	type UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { computeBillingCycleAnchorEntitlementUpdates } from "@/internal/billing/v2/compute/computeAutumnUtils/computeBillingCycleAnchorEntitlementUpdates.js";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan.js";
import { autumnBillingPlanToFinalFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer.js";
import { mergePooledBalancePlans } from "@/internal/billing/v2/utils/billingPlan/mergePooledBalancePlans.js";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan.js";

/** Reconciles final quantities and reset dates onto existing pools, preserving their identities. */
export const computeUpdateQuantityPooledAnchorResetPlan = ({
	ctx,
	plan,
	billingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	const finalCustomerProduct = findCustomerProductById({
		fullCustomer: autumnBillingPlanToFinalFullCustomer({
			billingContext,
			autumnBillingPlan: plan,
		}),
		customerProductId: billingContext.customerProduct.id,
	});
	if (!finalCustomerProduct)
		throw new InternalError({
			message:
				"Pooled quantity reset is missing its projected customer product.",
		});
	const { pooledBalancePlan: transition } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		outgoingCustomerProducts: [billingContext.customerProduct],
		incomingCustomerProducts: [finalCustomerProduct],
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
		now: billingContext.currentEpochMs,
	});
	const pooledBalancePlan = mergePooledBalancePlans({
		base: plan.pooledBalancePlan,
		incoming: transition,
	});
	const pools = (
		billingContext.fullCustomer.pooled_customer_entitlements ?? []
	).filter(
		(entitlement) =>
			entitlement.pooled_balance?.reset_mode ===
				PooledBalanceResetMode.Subscription &&
			entitlement.pooled_balance.stripe_subscription_id ===
				billingContext.stripeSubscription?.id,
	);
	if (pools.length === 0) return { ...plan, pooledBalancePlan };
	const anchorUpdates = computeBillingCycleAnchorEntitlementUpdates({
		billingContext,
		customerProduct: { ...finalCustomerProduct, customer_entitlements: pools },
	});
	const targetPoolIds = new Set(
		finalCustomerProduct.customer_entitlements.map(
			(entitlement) =>
				entitlement.pooled_balance_contribution?.pooled_balance_id,
		),
	);
	const poolUpdates = new Map(
		(pooledBalancePlan?.updatePoolBalances ?? []).map((update) => [
			update.pooledCustomerEntitlement.id,
			update,
		]),
	);
	const entitlementUpdates = new Map(
		(plan.updateCustomerEntitlements ?? []).map((update) => [
			update.customerEntitlement.id,
			update,
		]),
	);
	for (const { customerEntitlement, updates } of anchorUpdates) {
		const existing = poolUpdates.get(customerEntitlement.id);
		const pooledCustomerEntitlement =
			existing?.pooledCustomerEntitlement ?? customerEntitlement;
		const pooledBalance = pooledCustomerEntitlement.pooled_balance;
		if (!pooledBalance)
			throw new InternalError({
				message: "Pooled anchor reset is missing its pool.",
			});
		const resetsUsage =
			billingContextResetsUsage(billingContext) &&
			targetPoolIds.has(pooledBalance.id);
		const resetBalanceDelta = resetsUsage
			? subtractSafe({
					left: pooledBalance.granted,
					right: pooledCustomerEntitlement.balance,
				})
			: 0;
		poolUpdates.set(customerEntitlement.id, {
			balanceDelta: addSafe({
				left: existing?.balanceDelta ?? 0,
				right: resetBalanceDelta,
			}),
			grantedDelta: existing?.grantedDelta ?? 0,
			pooledCustomerEntitlement: {
				...pooledCustomerEntitlement,
				...updates,
				...(resetsUsage
					? { balance: pooledBalance.granted, adjustment: 0 }
					: {}),
				pooled_balance: {
					...pooledBalance,
					reset_cycle_anchor: updates?.reset_cycle_anchor ?? null,
				},
			},
		});
		const existingEntitlementUpdate = entitlementUpdates.get(
			customerEntitlement.id,
		);
		entitlementUpdates.set(customerEntitlement.id, {
			customerEntitlement,
			updates: {
				...existingEntitlementUpdate?.updates,
				...updates,
				...(resetsUsage ? { adjustment: 0 } : {}),
			},
		});
	}
	return {
		...plan,
		pooledBalancePlan: {
			...(pooledBalancePlan ?? emptyPooledBalancePlan()),
			updatePoolBalances: Array.from(poolUpdates.values()),
		},
		updateCustomerEntitlements: Array.from(entitlementUpdates.values()),
	};
};
