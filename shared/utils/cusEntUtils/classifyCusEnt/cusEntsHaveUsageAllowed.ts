import type { CustomerEntitlementWithPricesView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { nullish } from "../../utils.js";

export const cusEntsHaveUsageAllowed = ({
	cusEnts,
	internalFeatureId,
	includeUsageLimit = true,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	internalFeatureId: string;
	includeUsageLimit?: boolean;
}) => {
	return cusEnts.some(
		(customerEntitlement) =>
			customerEntitlement.internal_feature_id === internalFeatureId &&
			customerEntitlement.usage_allowed &&
			(includeUsageLimit
				? nullish(customerEntitlement.entitlement.usage_limit)
				: true),
	);
};
