import {
	customerProductHasActiveStatus,
	type FullCusProduct,
	filterCustomerEntitlementsByPooledBalanceSource,
	isCustomerProductEntityScoped,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { PooledBalanceComputeContext } from "../types/pooledBalanceComputeTypes";
import { addToInsertPoolContributions } from "../utils/pooledBalancePlanUtils";
import { computePooledBalanceContributionAmounts } from "./computePooledBalanceContributionAmounts";
import { computePooledBalanceLifecycle } from "./computePooledBalanceLifecycle";
import { initCustomerEntitlementPooledIdentity } from "./initCustomerEntitlementPooledIdentity";
import { initPooledBalanceContribution } from "./initPooledBalanceContribution";
import { normalizePooledBalanceContributionCustomerEntitlement } from "./normalizePooledBalanceContributionCustomerEntitlement";
import { upsertPooledBalance } from "./upsertPooledBalance";

export const applyIncomingPooledBalanceSources = ({
	ctx,
	computeContext,
	customerProduct,
	stripeSubscriptionId,
	customerCreatedAt,
	now,
}: {
	ctx: AutumnContext;
	computeContext: PooledBalanceComputeContext;
	customerProduct: FullCusProduct;
	stripeSubscriptionId?: string;
	customerCreatedAt: number;
	now: number;
}) => {
	if (
		!isCustomerProductEntityScoped(customerProduct) ||
		!customerProductHasActiveStatus(customerProduct)
	) {
		return;
	}

	const contributionCustomerEntitlements =
		filterCustomerEntitlementsByPooledBalanceSource({
			customerEntitlements: customerProduct.customer_entitlements,
		});

	for (const contributionCustomerEntitlement of contributionCustomerEntitlements) {
		const lifecycle = computePooledBalanceLifecycle({
			computeContext,
			customerEntitlement: contributionCustomerEntitlement,
			customerProduct,
			stripeSubscriptionId,
			customerCreatedAt,
			now,
		});

		const identity = initCustomerEntitlementPooledIdentity({
			customerEntitlement: contributionCustomerEntitlement,
			lifecycle,
		});

		const contributionAmounts = computePooledBalanceContributionAmounts({
			contributionCustomerEntitlement,
			customerProduct,
		});

		const pooledCustomerEntitlement = upsertPooledBalance({
			ctx,
			computeContext,
			contributionCustomerEntitlement,
			customerProduct,
			identity,
			contributionAmounts,
			nextResetAt: lifecycle.nextResetAt,
			now,
		});

		const contribution = initPooledBalanceContribution({
			pooledCustomerEntitlement,
			contributionCustomerEntitlement,
			customerProduct,
			contributionAmounts,
			now,
		});

		addToInsertPoolContributions({
			pooledBalancePlan: computeContext.plan,
			contribution,
		});
		normalizePooledBalanceContributionCustomerEntitlement({
			contributionCustomerEntitlement,
		});
	}
};
