import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { nullish } from "../../utils.js";

export const cusEntsHaveUsageAllowed = ({
	cusEnts,
	internalFeatureId,
	includeUsageLimit = true,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
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
