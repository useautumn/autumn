import type {
	AttachBillingContext,
	FullCusProduct,
	PooledBalancePlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computePooledBalanceTransitionPlan } from "./computePooledBalanceTransitionPlan";

export const computeAttachPooledBalancePlan = ({
	ctx,
	attachBillingContext,
	newCustomerProduct,
}: {
	ctx: AutumnContext;
	attachBillingContext: AttachBillingContext;
	newCustomerProduct: FullCusProduct;
}): {
	customerProduct: FullCusProduct;
	pooledBalancePlan?: PooledBalancePlan;
} => {
	const customerProduct = structuredClone(newCustomerProduct);
	if (attachBillingContext.planTiming !== "immediate") {
		return { customerProduct };
	}

	const { incomingCustomerProducts, pooledBalancePlan } =
		computePooledBalanceTransitionPlan({
			ctx,
			fullCustomer: attachBillingContext.fullCustomer,
			outgoingCustomerProducts: attachBillingContext.currentCustomerProduct
				? [attachBillingContext.currentCustomerProduct]
				: [],
			incomingCustomerProducts: [customerProduct],
			stripeSubscriptionId: attachBillingContext.stripeSubscription?.id,
			now: attachBillingContext.currentEpochMs,
		});

	return {
		customerProduct: incomingCustomerProducts[0],
		pooledBalancePlan,
	};
};
