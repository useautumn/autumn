import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";

type PooledBalanceColumns = Partial<
	Pick<FullCustomerEntitlement, "is_pooled_balance">
> & { entitlement: Pick<FullCustomerEntitlement["entitlement"], "pooled"> };

export const isSyntheticPooledBalanceCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: Pick<PooledBalanceColumns, "is_pooled_balance">;
}) => customerEntitlement.is_pooled_balance === true;

export const isPooledBalanceSourceCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: PooledBalanceColumns;
}) =>
	customerEntitlement.entitlement.pooled === true &&
	!isSyntheticPooledBalanceCustomerEntitlement({ customerEntitlement });
