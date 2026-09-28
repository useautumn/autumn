import type { CustomerEntitlementWithPricesView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { AllowanceType } from "../../../models/productModels/entModels/entModels.js";

export const cusEntsHaveUnlimited = ({
	cusEnts,
	internalFeatureId,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	internalFeatureId: string;
}) => {
	return cusEnts.some(
		(customerEntitlement) =>
			customerEntitlement.internal_feature_id === internalFeatureId &&
			(customerEntitlement.entitlement.allowance_type ===
				AllowanceType.Unlimited ||
				customerEntitlement.unlimited),
	);
};
