import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { isBooleanFeature } from "../../featureUtils/classifyFeature/isBooleanFeature.js";
import {
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
} from "../classifyCusEntUtils.js";

export const isCustomerEntitlementInOverage = ({
	customerEntitlement,
}: {
	customerEntitlement: Pick<
		FullCustomerEntitlementView,
		"entitlement" | "balance"
	>;
}): boolean => {
	const isBelowZero = (customerEntitlement.balance ?? 0) < 0;
	return (
		isBelowZero &&
		!isBooleanFeature(customerEntitlement.entitlement.feature) &&
		!isUnlimitedCusEnt(customerEntitlement) &&
		!isEntityScopedCusEnt(customerEntitlement)
	);
};
