import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import { isUnlimitedCustomerEntitlement } from "./isUnlimitedCustomerEntitlement.js";

export const isLiveLooseCustomerEntitlement = ({
	customerEntitlement,
}: {
	customerEntitlement: Pick<
		FullCustomerEntitlementView,
		"balance" | "unlimited" | "next_reset_at" | "entitlement"
	>;
}): boolean =>
	(customerEntitlement.balance ?? 0) !== 0 ||
	isUnlimitedCustomerEntitlement({ customerEntitlement }) ||
	customerEntitlement.next_reset_at != null ||
	customerEntitlement.entitlement.feature.type === FeatureType.Boolean;
