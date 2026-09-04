import {
	type AutumnBillingPlan,
	CusProductStatus,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { applyCustomerLicensePlanOps } from "@/internal/billing/v2/utils/billingPlan/applyCustomerLicensePlanOps";
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
	const isLicenseQuantityUpdate =
		billingContext.intent === UpdateSubscriptionIntent.UpdateLicenseQuantity;
	const transitionsImmediately =
		isLicenseQuantityUpdate ||
		billingContext.cancelAction === "cancel_immediately" ||
		(billingContext.intent === UpdateSubscriptionIntent.UpdatePlan &&
			billingContext.customerProduct.status !== CusProductStatus.Scheduled);
	if (!transitionsImmediately) return plan;

	const updatesExistingCustomerProduct =
		billingContext.patchContext?.mode === "existing";
	const incomingCustomerProductSnapshots = isLicenseQuantityUpdate
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
		outgoingCustomerProducts: isLicenseQuantityUpdate
			? []
			: [billingContext.customerProduct],
		incomingCustomerProducts: incomingCustomerProductSnapshots,
		stripeSubscriptionId: billingContext.stripeSubscription?.id,
		now: billingContext.currentEpochMs,
	});

	if (updatesExistingCustomerProduct) {
		return { ...plan, pooledBalancePlan };
	}

	return {
		...plan,
		pooledBalancePlan,
	};
};
