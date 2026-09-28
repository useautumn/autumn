import type {
	CustomerLicenseTransition,
	FullCusProduct,
	FullCustomer,
	PooledBalancePlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { applyIncomingPooledBalanceSources } from "./applyIncomingPooledBalanceSources/applyIncomingPooledBalanceSources";
import { applyLicensePooledBalances } from "./applyLicensePooledBalances/applyLicensePooledBalances";
import { applyOutgoingPooledBalanceSources } from "./applyOutgoingPooledBalanceSources/applyOutgoingPooledBalanceSources";
import { applyPooledBalancePlanToIncomingCustomerProducts } from "./applyPooledBalancePlanToIncomingCustomerProducts";
import { setupPooledBalanceComputeContext } from "./context/setupPooledBalanceComputeContext";
import { finalizePooledBalanceTransitionPlan } from "./finalizePooledBalanceTransitionPlan";

export const computePooledBalanceTransitionPlan = ({
	ctx,
	fullCustomer,
	outgoingCustomerProducts = [],
	incomingCustomerProducts: inputIncomingCustomerProducts = [],
	stripeSubscriptionId,
	customerLicenseTransitions,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	outgoingCustomerProducts?: FullCusProduct[];
	incomingCustomerProducts?: FullCusProduct[];
	stripeSubscriptionId?: string;
	/** Lets license pools reset usage when the plan change alters their item. */
	customerLicenseTransitions?: CustomerLicenseTransition[];
	now: number;
}): {
	pooledBalancePlan?: PooledBalancePlan;
} => {
	const incomingCustomerProducts: FullCusProduct[] = [];
	const incomingCustomerProductIds = new Set<string>();
	for (const customerProduct of inputIncomingCustomerProducts) {
		if (incomingCustomerProductIds.has(customerProduct.id)) continue;
		incomingCustomerProductIds.add(customerProduct.id);
		incomingCustomerProducts.push(customerProduct);
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

	// Every incoming product lands on the same subscription, so pools must agree
	// on the stand-in id — otherwise they split, then collide once the real
	// subscription id is stamped onto both.
	const pendingSubscriptionId = incomingCustomerProducts
		.map((customerProduct) => customerProduct.id)
		.sort()[0];

	for (const customerProduct of incomingCustomerProducts) {
		applyIncomingPooledBalanceSources({
			ctx,
			computeContext,
			customerProduct,
			stripeSubscriptionId:
				stripeSubscriptionId ??
				customerProduct.subscription_ids?.[0] ??
				pendingSubscriptionId,
			customerCreatedAt: fullCustomer.created_at,
			now,
		});
	}

	const incomingCustomerLicenses = incomingCustomerProducts.flatMap(
		(customerProduct) => customerProduct.customer_licenses ?? [],
	);
	const incomingLicenseLinkIds = new Set(
		incomingCustomerLicenses.map((customerLicense) => customerLicense.link_id),
	);
	applyLicensePooledBalances({
		ctx,
		computeContext,
		customerLicenses: [
			...incomingCustomerLicenses,
			...outgoingCustomerProducts.flatMap((customerProduct) =>
				incomingCustomerProductIds.has(customerProduct.id)
					? []
					: (customerProduct.customer_licenses ?? []).filter(
							(customerLicense) =>
								!incomingLicenseLinkIds.has(customerLicense.link_id),
						),
			),
		],
		parentCustomerProducts: [
			...incomingCustomerProducts,
			...outgoingCustomerProducts,
		],
		customerLicenseTransitions,
		customerCreatedAt: fullCustomer.created_at,
		now,
	});

	const pooledBalancePlan = finalizePooledBalanceTransitionPlan({
		computeContext,
		now,
	});
	applyPooledBalancePlanToIncomingCustomerProducts({
		customerProducts: incomingCustomerProducts,
		pooledBalancePlan,
	});

	return { pooledBalancePlan };
};
