import type {
	FullCusProduct,
	InsertPooledBalanceContribution,
	PooledBalancePlan,
} from "@autumn/shared";
import { normalizePooledBalanceContributionCustomerEntitlement } from "../normalizePooledBalanceContributionCustomerEntitlement";

export const applyPooledBalancePlanToIncomingCustomerProducts = ({
	customerProducts,
	pooledBalancePlan,
}: {
	customerProducts: FullCusProduct[];
	pooledBalancePlan?: PooledBalancePlan;
}) => {
	if (!pooledBalancePlan) return;

	const contributionBySourceCustomerEntitlementId = new Map<
		string,
		Pick<InsertPooledBalanceContribution, "id">
	>(
		[
			...pooledBalancePlan.insertPoolContributions,
			...pooledBalancePlan.updatePoolContributions,
		].map((contribution) => [
			contribution.source_customer_entitlement_id,
			contribution,
		]),
	);

	for (const customerProduct of customerProducts) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			const contribution = contributionBySourceCustomerEntitlementId.get(
				customerEntitlement.id,
			);
			if (!contribution) continue;

			normalizePooledBalanceContributionCustomerEntitlement({
				contributionCustomerEntitlement: customerEntitlement,
				contribution,
			});
		}
	}
};
