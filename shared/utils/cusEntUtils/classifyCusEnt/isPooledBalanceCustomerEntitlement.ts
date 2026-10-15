import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";

type PooledBalanceColumns = Partial<
	Pick<FullCustomerEntitlement, "is_pooled_balance" | "pooled_contribution_id">
> & { entitlement: Pick<FullCustomerEntitlement["entitlement"], "pooled"> };

export const isSyntheticPooledBalanceCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: Pick<PooledBalanceColumns, "is_pooled_balance">;
}) => customerEntitlement.is_pooled_balance === true;

/** A pooled item, or a grant pooled because its feature combines by max / min, which is known by its share. */
export const isPooledBalanceSourceCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: PooledBalanceColumns;
}) =>
	(customerEntitlement.entitlement.pooled === true ||
		customerEntitlement.pooled_contribution_id != null) &&
	!isSyntheticPooledBalanceCustomerEntitlement({ customerEntitlement });
