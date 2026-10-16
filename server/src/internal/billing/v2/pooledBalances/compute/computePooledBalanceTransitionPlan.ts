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
import {
	competingFeatureIdsOf,
	staleCompetingCustomerProducts,
} from "./competing/staleCompetingCustomerProducts";
import { setupPooledBalanceComputeContext } from "./context/setupPooledBalanceComputeContext";
import { finalizePooledBalanceTransitionPlan } from "./finalizePooledBalanceTransitionPlan";
import {
	isPaidSubscriptionPoolHost,
	misplacedFreeCustomerProducts,
} from "./utils/subscriptionPoolHost";
import {
	isUnlimitedAdditiveSource,
	misplacedUnlimitedCustomerProducts,
} from "./utils/unlimitedPoolShare";

/** The product with only the grants that match: lets limited grants open their pools before unlimited ones look for one to join. */
const withCustomerEntitlements = ({
	customerProduct,
	unlimitedAdditive,
}: {
	customerProduct: FullCusProduct;
	unlimitedAdditive: boolean;
}): FullCusProduct => ({
	...customerProduct,
	customer_entitlements: customerProduct.customer_entitlements.filter(
		(customerEntitlement) =>
			isUnlimitedAdditiveSource({ customerEntitlement, customerProduct }) ===
			unlimitedAdditive,
	),
});

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
		customerProducts: fullCustomer.customer_products,
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

	// Paid plans go first so a free plan arriving alongside them finds their pool.
	const paidFirstIncomingCustomerProducts = [
		...incomingCustomerProducts.filter((customerProduct) =>
			isPaidSubscriptionPoolHost({ customerProduct }),
		),
		...incomingCustomerProducts.filter(
			(customerProduct) => !isPaidSubscriptionPoolHost({ customerProduct }),
		),
	];
	// Limited grants go before unlimited ones so an unlimited grant finds the limited pool it joins.
	for (const unlimitedAdditive of [false, true]) {
		for (const customerProduct of paidFirstIncomingCustomerProducts) {
			applyIncomingPooledBalanceSources({
				ctx,
				computeContext,
				customerProduct: withCustomerEntitlements({
					customerProduct,
					unlimitedAdditive,
				}),
				stripeSubscriptionId:
					stripeSubscriptionId ??
					customerProduct.subscription_ids?.[0] ??
					pendingSubscriptionId,
				customerCreatedAt: fullCustomer.created_at,
				now,
			});
		}
	}

	// A paid plan arriving pulls the free plans the customer already holds into its pool.
	const mergedFreeCustomerProducts = paidFirstIncomingCustomerProducts.some(
		(customerProduct) => isPaidSubscriptionPoolHost({ customerProduct }),
	)
		? misplacedFreeCustomerProducts({
				computeContext,
				fullCustomer,
				excludedCustomerProductIds: new Set([
					...incomingCustomerProductIds,
					...outgoingCustomerProductIds,
				]),
			})
		: [];
	for (const customerProduct of mergedFreeCustomerProducts) {
		applyOutgoingPooledBalanceSources({ computeContext, customerProduct });
		applyIncomingPooledBalanceSources({
			ctx,
			computeContext,
			customerProduct,
			customerCreatedAt: fullCustomer.created_at,
			now,
		});
	}

	// A limited pool arriving pulls in the unlimited grants the customer already holds in a pool of their own.
	for (const customerProduct of misplacedUnlimitedCustomerProducts({
		computeContext,
		fullCustomer,
		excludedCustomerProductIds: new Set([
			...incomingCustomerProductIds,
			...outgoingCustomerProductIds,
		]),
	})) {
		applyOutgoingPooledBalanceSources({ computeContext, customerProduct });
		applyIncomingPooledBalanceSources({
			ctx,
			computeContext,
			customerProduct,
			stripeSubscriptionId:
				customerProduct.subscription_ids?.[0] ?? customerProduct.id,
			customerCreatedAt: fullCustomer.created_at,
			now,
		});
	}

	for (const customerProduct of staleCompetingCustomerProducts({
		fullCustomer,
		featureIds: competingFeatureIdsOf({
			incomingCustomerProducts,
			outgoingCustomerProducts,
		}),
		excludedCustomerProductIds: new Set([
			...incomingCustomerProductIds,
			...outgoingCustomerProductIds,
		]),
	})) {
		// An additive share from before the switch leaves first, then rejoins as a competing one.
		applyOutgoingPooledBalanceSources({
			computeContext,
			customerProduct,
			convertingToCompeting: true,
		});
		applyIncomingPooledBalanceSources({
			ctx,
			computeContext,
			customerProduct,
			stripeSubscriptionId:
				customerProduct.subscription_ids?.[0] ?? customerProduct.id,
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
