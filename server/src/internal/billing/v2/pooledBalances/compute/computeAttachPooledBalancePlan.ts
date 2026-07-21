import type {
	AttachBillingContext,
	FullCusProduct,
	PooledBalancePlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyIncomingPooledBalanceSources } from "./applyIncomingPooledBalanceSources/applyIncomingPooledBalanceSources";
import { applyOutgoingPooledBalanceSources } from "./applyOutgoingPooledBalanceSources/applyOutgoingPooledBalanceSources";
import { finalizePooledBalanceComputeContext } from "./context/finalizePooledBalanceComputeContext";
import { setupPooledBalanceComputeContext } from "./context/setupPooledBalanceComputeContext";

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

	const computeContext = setupPooledBalanceComputeContext({
		pooledCustomerEntitlements:
			attachBillingContext.fullCustomer.pooled_customer_entitlements ?? [],
	});

	applyOutgoingPooledBalanceSources({
		computeContext,
		customerProduct: attachBillingContext.currentCustomerProduct,
	});

	applyIncomingPooledBalanceSources({
		ctx,
		computeContext,
		customerProduct,
		stripeSubscriptionId: attachBillingContext.stripeSubscription?.id,
		customerCreatedAt: attachBillingContext.fullCustomer.created_at,
		now: attachBillingContext.currentEpochMs,
	});

	return {
		customerProduct,
		pooledBalancePlan: finalizePooledBalanceComputeContext({ computeContext }),
	};
};
