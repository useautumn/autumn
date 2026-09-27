import type {
	AttachBillingContext,
	CustomerLicenseTransition,
	FullCusProduct,
	PooledBalancePlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePooledBalanceTransitionPlan } from "./computePooledBalanceTransitionPlan";

export const computeAttachPooledBalancePlan = ({
	ctx,
	attachBillingContext,
	newCustomerProduct,
	customerLicenseTransitions = [],
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	newCustomerProduct: FullCusProduct;
	customerLicenseTransitions?: CustomerLicenseTransition[];
}): {
	customerProduct: FullCusProduct;
	pooledBalancePlan?: PooledBalancePlan;
	customerLicenseTransitions: CustomerLicenseTransition[];
} => {
	if (attachBillingContext.planTiming !== "immediate") {
		return {
			customerProduct: newCustomerProduct,
			customerLicenseTransitions: [],
		};
	}

	const result = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: attachBillingContext.fullCustomer,
		outgoingCustomerProducts: attachBillingContext.currentCustomerProduct
			? [attachBillingContext.currentCustomerProduct]
			: [],
		incomingCustomerProducts: [newCustomerProduct],
		customerLicenseTransitions,
		stripeSubscriptionId: attachBillingContext.stripeSubscription?.id,
		now: attachBillingContext.currentEpochMs,
	});

	return {
		customerProduct: newCustomerProduct,
		...result,
	};
};
