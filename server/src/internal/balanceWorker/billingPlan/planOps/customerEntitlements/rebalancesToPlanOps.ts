import {
	type BillingPlanOp,
	toBillingPlanRebalanceOp,
} from "@autumn/balance-engine";
import type { AutumnBillingPlan } from "@autumn/shared";

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

export const rebalancesToPlanOps = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): BillingPlanOp[] => [
	...oneOffPurchasesToPlanOps({ autumnBillingPlan }),
	...autoTopupToPlanOps({ autumnBillingPlan }),
];
