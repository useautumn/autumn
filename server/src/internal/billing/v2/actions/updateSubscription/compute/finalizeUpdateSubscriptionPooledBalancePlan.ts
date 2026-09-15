import {
	type AutumnBillingPlan,
	CusProductStatus,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { applyCustomerLicensePlanOps } from "@/internal/billing/v2/utils/billingPlan/applyCustomerLicensePlanOps";
import { mergePooledBalancePlans } from "@/internal/billing/v2/utils/billingPlan/mergePooledBalancePlans";
import {
	applyCustomerProductPatch,
	getPatchCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

export const finalizeUpdateSubscriptionPooledBalancePlan = ({
	ctx,
	plan,
	billingContext,
}: {
	ctx: AutumnContext;
	plan: AutumnBillingPlan;
	billingContext: UpdateSubscriptionBillingContext;
}): AutumnBillingPlan => {
	// Keyed on plan contents: any quantity update that moves license pool
	// counters re-snapshots the same parent customer product in place.
	const movesLicensePools = (plan.customerLicenseUpdates?.length ?? 0) > 0;
	const transitionsImmediately =
		movesLicensePools ||
		billingContext.cancelAction === "cancel_immediately" ||
		(billingContext.intent === UpdateSubscriptionIntent.UpdatePlan &&
			billingContext.customerProduct.status !== CusProductStatus.Scheduled);
	if (!transitionsImmediately) return plan;

	const updatesExistingCustomerProduct =
		billingContext.patchContext?.mode === "existing";
	const incomingCustomerProductSnapshots = movesLicensePools
		? applyCustomerLicensePlanOps({
				customerProducts: [billingContext.customerProduct],
				autumnBillingPlan: plan,
			})
		: updatesExistingCustomerProduct
			? applyCustomerLicensePlanOps({
					customerProducts: getPatchCustomerProducts({
						autumnBillingPlan: plan,
					}).map((patch) =>
						applyCustomerProductPatch({
							customerProduct: patch.customerProduct,
							patch,
						}),
					),
					autumnBillingPlan: plan,
				})
			: plan.insertCustomerProducts;
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		// Quantity update keeps the same parent CP; only license counters change.
		outgoingCustomerProducts: movesLicensePools
			? []
			: [billingContext.customerProduct],
		incomingCustomerProducts: incomingCustomerProductSnapshots,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
		now: billingContext.currentEpochMs,
	});

	return {
		...plan,
		pooledBalancePlan: mergePooledBalancePlans({
			base: plan.pooledBalancePlan,
			incoming: pooledBalancePlan,
		}),
	};
};
