import type { FullCustomerEntitlement } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import { isPooledBalanceSourceCustomerEntitlement } from "../classifyCusEnt/isPooledBalanceCustomerEntitlement.js";

export const filterCustomerEntitlementsByPooledBalanceSource = <
	T extends FullCustomerEntitlement,
>({
	customerEntitlements,
}: {
	customerEntitlements: T[];
}): T[] =>
	customerEntitlements.filter((customerEntitlement) =>
		isPooledBalanceSourceCustomerEntitlement({ customerEntitlement }),
	);
