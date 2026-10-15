import {
	type FullCusProduct,
	type FullCustomerEntitlement,
	type InsertPooledBalanceContribution,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";
import type {
	MutablePooledCustomerEntitlement,
	PooledBalanceContributionAmounts,
} from "../types/pooledBalanceComputeTypes";

export const initPooledBalanceContribution = ({
	pooledCustomerEntitlement,
	contributionCustomerEntitlement,
	customerProduct,
	contributionAmounts,
	competes = false,
	now,
}: {
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
	contributionCustomerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	contributionAmounts: PooledBalanceContributionAmounts;
	competes?: boolean;
	now: number;
}): InsertPooledBalanceContribution => {
	const unlimited =
		competes &&
		isUnlimitedEntitlement({
			entitlement: contributionCustomerEntitlement.entitlement,
		});
	return {
		id: generateId("pool_contribution"),
		pooled_balance_id: pooledCustomerEntitlement.pooled_balance.id,
		source_customer_product_id: customerProduct.id,
		source_customer_entitlement_id: contributionCustomerEntitlement.id,
		current_contribution: unlimited
			? 0
			: contributionAmounts.currentContribution,
		next_cycle_contribution: unlimited
			? 0
			: contributionAmounts.nextCycleContribution,
		effective_at: null,
		competes,
		unlimited,
		created_at: now,
		updated_at: now,
	};
};
