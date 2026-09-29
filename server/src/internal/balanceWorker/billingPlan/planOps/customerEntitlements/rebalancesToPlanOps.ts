import {
	type BillingPlanOp,
	toBillingPlanRebalanceOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

/** A one-off purchase lands on the row it bought, after the worker refunds the overage it covers. */
const oneOffPurchasesToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] =>
	(autumnBillingPlan.oneOffPurchaseRebalance?.purchases ?? []).map(
		({ customerEntitlementId, featureId, quantity }) =>
			toBillingPlanRebalanceOp({
				id: customerEntitlementId,
				featureId,
				quantity,
				creditedId: customerEntitlementId,
			}),
	);

type AutoTopupRebalance = NonNullable<AutumnBillingPlan["autoTopupRebalance"]>;

/** The purchase the worker sizes; null on a top-up without its fields (saved before, or a producer not moved yet), which keeps to Postgres. */
export const autoTopupRebalanceToPurchase = ({
	autoTopupRebalance,
}: {
	autoTopupRebalance: AutoTopupRebalance;
}) => {
	const {
		customerEntitlementId,
		featureId,
		quantity,
		creditedCustomerEntitlementId,
	} = autoTopupRebalance;
	if (
		customerEntitlementId === undefined ||
		featureId === undefined ||
		quantity === undefined ||
		creditedCustomerEntitlementId === undefined
	)
		return null;
	return {
		customerEntitlementId,
		featureId,
		quantity,
		creditedCustomerEntitlementId,
	};
};

/** A top-up the worker sizes live: its overage refunded, the leftover credited. */
const autoTopupToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => {
	const { autoTopupRebalance } = autumnBillingPlan;
	const purchase =
		autoTopupRebalance && autoTopupRebalanceToPurchase({ autoTopupRebalance });
	if (!purchase) return [];
	return [
		toBillingPlanRebalanceOp({
			id: purchase.customerEntitlementId,
			featureId: purchase.featureId,
			quantity: purchase.quantity,
			creditedId: purchase.creditedCustomerEntitlementId,
		}),
	];
};

/** Purchases, in the order the Postgres lane applies them: one-offs, then the top-up. */
export const rebalancesToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => [
	...oneOffPurchasesToPlanOps({ autumnBillingPlan }),
	...autoTopupToPlanOps({ autumnBillingPlan }),
];
