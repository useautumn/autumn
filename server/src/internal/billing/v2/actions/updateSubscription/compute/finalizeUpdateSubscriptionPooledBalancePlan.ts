import {
	type AutumnBillingPlan,
	CusProductStatus,
	type UpdateSubscriptionBillingContext,
	UpdateSubscriptionIntent,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
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
	const transitionsImmediately =
		billingContext.cancelAction === "cancel_immediately" ||
		(billingContext.intent === UpdateSubscriptionIntent.UpdatePlan &&
			billingContext.customerProduct.status !== CusProductStatus.Scheduled);
	if (!transitionsImmediately) return plan;

	const updatesExistingCustomerProduct =
		billingContext.patchContext?.mode === "existing";
	const incomingCustomerProductSnapshots = updatesExistingCustomerProduct
		? getPatchCustomerProducts({ autumnBillingPlan: plan }).map((patch) =>
				applyCustomerProductPatch({
					customerProduct: patch.customerProduct,
					patch,
				}),
			)
		: plan.insertCustomerProducts;
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: billingContext.fullCustomer,
		outgoingCustomerProducts: [billingContext.customerProduct],
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
