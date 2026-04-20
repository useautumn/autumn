import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { AllowanceType } from "../../../models/productModels/entModels/entModels.js";

export const cusEntsHaveUnlimited = ({
	cusEnts,
	internalFeatureId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
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
