import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { isBooleanFeature } from "../../featureUtils/classifyFeature/isBooleanFeature.js";
import {
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
} from "../classifyCusEntUtils.js";

/** The row's own balance is below 0; a per-entity row's overage lives in `entities`, not here. */
export const isCustomerEntitlementInOverage = ({
	customerEntitlement,
}: {
	customerEntitlement: Pick<
		FullCustomerEntitlementView,
		"entitlement" | "balance"
	>;
}): boolean => {
	const isBelowZero = (customerEntitlement.balance ?? 0) < 0;
	// Unlimited by allowance only, not the row's `unlimited` column.
	return (
		isBelowZero &&
		!isBooleanFeature(customerEntitlement.entitlement.feature) &&
		!isUnlimitedCusEnt(customerEntitlement) &&
		!isEntityScopedCusEnt(customerEntitlement)
	);
};
