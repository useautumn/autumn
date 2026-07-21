import type {
	FullCusProduct,
	FullCustomerEntitlement,
	InsertPooledBalanceContribution,
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
	now,
}: {
	pooledCustomerEntitlement: MutablePooledCustomerEntitlement;
	contributionCustomerEntitlement: FullCustomerEntitlement;
	customerProduct: FullCusProduct;
	contributionAmounts: PooledBalanceContributionAmounts;
	now: number;
}): InsertPooledBalanceContribution => ({
	id: generateId("pool_contribution"),
	pooled_balance_id: pooledCustomerEntitlement.pooled_balance.id,
	source_customer_product_id: customerProduct.id,
	source_customer_entitlement_id: contributionCustomerEntitlement.id,
	current_contribution: contributionAmounts.currentContribution,
	next_cycle_contribution: contributionAmounts.nextCycleContribution,
	effective_at: null,
	created_at: now,
	updated_at: now,
});
