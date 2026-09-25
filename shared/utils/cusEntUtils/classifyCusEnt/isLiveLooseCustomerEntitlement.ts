import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import { isUnlimitedCustomerEntitlement } from "./isUnlimitedCustomerEntitlement.js";

/**
 * A loose grant that still means something: a spendable balance, unlimited, a pending reset, or a boolean flag.
 * The subject reads' SQL drops the rest; every in-memory view must drop them the same way.
 */
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
