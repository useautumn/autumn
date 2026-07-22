import type {
	DbPooledBalanceContribution,
	FullCustomer,
	FullCustomerEntitlement,
	PooledBalancePlan,
} from "@autumn/shared";
import { normalizePooledBalanceContributionCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/normalizePooledBalanceContributionCustomerEntitlement";

export const applyPooledBalancePlanToFullCustomer = ({
	fullCustomer,
	pooledBalancePlan,
}: {
	fullCustomer: FullCustomer;
	pooledBalancePlan?: PooledBalancePlan;
}) => {
	if (!pooledBalancePlan) return;

	const sourceCustomerEntitlementById = new Map(
		fullCustomer.customer_products
			.flatMap((customerProduct) => customerProduct.customer_entitlements)
			.map((customerEntitlement) => [
				customerEntitlement.id,
				customerEntitlement,
			]),
	);
	const deletedContributionIds = new Set(
		pooledBalancePlan.deletePoolContributions.map(
			(contribution) => contribution.id,
		),
	);

	for (const customerEntitlement of sourceCustomerEntitlementById.values()) {
		if (
			!customerEntitlement.pooled_contribution_id ||
			!deletedContributionIds.has(customerEntitlement.pooled_contribution_id)
		) {
			continue;
		}

		customerEntitlement.pooled_contribution_id = null;
		customerEntitlement.pooled_balance_contribution = undefined;
	}

	for (const contribution of [
		...pooledBalancePlan.insertPoolContributions,
		...pooledBalancePlan.updatePoolContributions,
	]) {
		const customerEntitlement = sourceCustomerEntitlementById.get(
			contribution.source_customer_entitlement_id,
		);
		if (!customerEntitlement) continue;

		normalizePooledBalanceContributionCustomerEntitlement({
			contributionCustomerEntitlement: customerEntitlement,
			contribution,
		});
		customerEntitlement.pooled_balance_contribution =
			contribution as DbPooledBalanceContribution;
	}

	const pooledCustomerEntitlementById = new Map<
		string,
		FullCustomerEntitlement
	>(
		(fullCustomer.pooled_customer_entitlements ?? []).map(
			(customerEntitlement) => [customerEntitlement.id, customerEntitlement],
		),
	);
	for (const customerEntitlement of pooledBalancePlan.insertPoolBalances) {
		pooledCustomerEntitlementById.set(
			customerEntitlement.id,
			structuredClone(customerEntitlement),
		);
	}
	for (const update of pooledBalancePlan.updatePoolBalances) {
		pooledCustomerEntitlementById.set(
			update.pooledCustomerEntitlement.id,
			structuredClone(update.pooledCustomerEntitlement),
		);
	}

	fullCustomer.pooled_customer_entitlements = Array.from(
		pooledCustomerEntitlementById.values(),
	);
};
