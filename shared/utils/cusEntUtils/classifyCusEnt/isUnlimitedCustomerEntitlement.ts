import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { AllowanceType } from "../../../models/productModels/entModels/entModels.js";

/** The row is an infinite sink: its entitlement grants unlimited use, or the row itself was marked unlimited. */
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
