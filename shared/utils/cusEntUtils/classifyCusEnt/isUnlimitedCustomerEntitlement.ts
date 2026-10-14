import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { AllowanceType } from "../../../models/productModels/entModels/entModels.js";

export const isUnlimitedCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: Pick<
		FullCustomerEntitlementView,
		"unlimited" | "entitlement"
	>;
}): boolean =>
	Boolean(customerEntitlement.unlimited) ||
	customerEntitlement.entitlement.allowance_type === AllowanceType.Unlimited;
