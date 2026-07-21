import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";

export const isSyntheticPooledBalanceCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCustomerEntitlement;
}) => customerEntitlement.is_pooled_balance === true;

export const isPooledBalanceSourceCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCustomerEntitlement;
}) =>
	customerEntitlement.entitlement.pooled === true &&
	!isSyntheticPooledBalanceCustomerEntitlement({ customerEntitlement });
