import {
	type FullCusProduct,
	type FullCustomer,
	getCycleEnd,
	isResettingEntitlement,
	notNullish,
	PooledBalanceResetMode,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { emptyPooledBalancePlan } from "@/internal/billing/v2/utils/billingPlan/pooledBalancePlan.js";
import { computePooledBalanceTransitionPlan } from "./computePooledBalanceTransitionPlan.js";

/** Reconciles subscription contributions at a completed anchor before the shared balance reset. */
export const computeScheduledPooledAnchorResetPlan = ({
	ctx,
	fullCustomer,
	customerProducts,
	stripeSubscriptionId,
	anchorMs,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
	anchorMs: number;
}) => {
	// A pool is only re-anchored and reset here when one of the products whose
	// scheduled reset actually landed contributes to it. Products still mid-cycle
	// on the same subscription keep their pools untouched, since their
	// contributions are not reconciled by this pass.
	const resetContributionPoolIds = new Set(
		customerProducts.flatMap((customerProduct) =>
			customerProduct.customer_entitlements
				.map(
					(customerEntitlement) =>
						customerEntitlement.pooled_balance_contribution?.pooled_balance_id,
				)
				.filter(notNullish),
		),
	);
	const pools = (fullCustomer.pooled_customer_entitlements ?? []).filter(
		(customerEntitlement) =>
			customerEntitlement.pooled_balance?.reset_mode ===
				PooledBalanceResetMode.Subscription &&
			customerEntitlement.pooled_balance.stripe_subscription_id ===
				stripeSubscriptionId &&
			resetContributionPoolIds.has(customerEntitlement.pooled_balance.id) &&
			isResettingEntitlement({ entitlement: customerEntitlement.entitlement }),
	);
	const poolIds = new Set(pools.map((pool) => pool.pooled_balance!.id));
	const outgoingCustomerProducts = customerProducts.map((customerProduct) => ({
		...customerProduct,
		customer_entitlements: customerProduct.customer_entitlements.filter(
			(customerEntitlement) =>
				poolIds.has(
					customerEntitlement.pooled_balance_contribution?.pooled_balance_id ??
						"",
				),
		),
	}));
	const incomingCustomerProducts = outgoingCustomerProducts.map(
		(customerProduct) => ({
			...customerProduct,
			billing_cycle_anchor: anchorMs,
			billing_cycle_anchor_resets_at: null,
			options: customerProduct.options.map((option) => ({
				...option,
				quantity: option.upcoming_quantity ?? option.quantity,
				upcoming_quantity: null,
			})),
			customer_entitlements: customerProduct.customer_entitlements.map(
				(customerEntitlement) => ({
					...customerEntitlement,
					balance: 0,
					reset_cycle_anchor: anchorMs,
					next_reset_at: getCycleEnd({
						anchor: anchorMs,
						now: anchorMs,
						interval: customerEntitlement.entitlement.interval!,
						intervalCount: customerEntitlement.entitlement.interval_count,
					}),
				}),
			),
		}),
	);
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts,
		stripeSubscriptionId,
		now: anchorMs,
	});
	const updates = new Map(
		(pooledBalancePlan?.updatePoolBalances ?? []).map((update) => [
			update.pooledCustomerEntitlement.id,
			update,
		]),
	);
	for (const pool of pools) {
		const existing = updates.get(pool.id);
		const snapshot = existing?.pooledCustomerEntitlement ?? pool;
		updates.set(pool.id, {
			balanceDelta: existing?.balanceDelta ?? 0,
			grantedDelta: existing?.grantedDelta ?? 0,
			pooledCustomerEntitlement: {
				...snapshot,
				reset_cycle_anchor: anchorMs,
				next_reset_at: anchorMs,
				pooled_balance: {
					...snapshot.pooled_balance!,
					reset_cycle_anchor: anchorMs,
				},
			},
		});
	}
	return {
		...(pooledBalancePlan ?? emptyPooledBalancePlan()),
		updatePoolBalances: Array.from(updates.values()),
	};
};
