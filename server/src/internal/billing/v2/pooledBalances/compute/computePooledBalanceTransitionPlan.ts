import type {
	FullCusProduct,
	FullCustomer,
	PooledBalancePlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyIncomingPooledBalanceSources } from "./applyIncomingPooledBalanceSources/applyIncomingPooledBalanceSources";
import { applyOutgoingPooledBalanceSources } from "./applyOutgoingPooledBalanceSources/applyOutgoingPooledBalanceSources";
import { setupPooledBalanceComputeContext } from "./context/setupPooledBalanceComputeContext";
import { finalizePooledBalanceTransitionPlan } from "./finalizePooledBalanceTransitionPlan";

export const computePooledBalanceTransitionPlan = ({
	ctx,
	fullCustomer,
	outgoingCustomerProducts = [],
	incomingCustomerProducts: inputIncomingCustomerProducts = [],
	stripeSubscriptionId,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	outgoingCustomerProducts?: FullCusProduct[];
	incomingCustomerProducts?: FullCusProduct[];
	stripeSubscriptionId?: string;
	now: number;
}): {
	incomingCustomerProducts: FullCusProduct[];
	pooledBalancePlan?: PooledBalancePlan;
} => {
	const incomingCustomerProducts: FullCusProduct[] = [];
	const incomingCustomerProductIds = new Set<string>();
	for (const customerProduct of inputIncomingCustomerProducts) {
		if (incomingCustomerProductIds.has(customerProduct.id)) continue;
		incomingCustomerProductIds.add(customerProduct.id);
		incomingCustomerProducts.push(structuredClone(customerProduct));
	}
	const computeContext = setupPooledBalanceComputeContext({
		pooledCustomerEntitlements: fullCustomer.pooled_customer_entitlements ?? [],
	});

	const outgoingCustomerProductIds = new Set<string>();
	for (const customerProduct of outgoingCustomerProducts) {
		if (outgoingCustomerProductIds.has(customerProduct.id)) continue;
		outgoingCustomerProductIds.add(customerProduct.id);
		applyOutgoingPooledBalanceSources({
			computeContext,
			customerProduct,
		});
	}

	for (const customerProduct of incomingCustomerProducts) {
		applyIncomingPooledBalanceSources({
			ctx,
			computeContext,
			customerProduct,
			stripeSubscriptionId:
				stripeSubscriptionId ?? customerProduct.subscription_ids?.[0],
			customerCreatedAt: fullCustomer.created_at,
			now,
		});
	}

	return {
		incomingCustomerProducts,
		pooledBalancePlan: finalizePooledBalanceTransitionPlan({
			pooledBalancePlan: computeContext.plan,
			incomingCustomerProducts,
		}),
	};
};
