import type { Feature } from "../../../models/featureModels/featureModels.js";
import type {
	Entitlement,
	EntitlementWithFeature,
} from "../../../models/productModels/entModels/entModels.js";
import { findFeatureByInternalId } from "../../featureUtils/findFeatureUtils.js";

export const enrichEntitlementWithFeature = ({
	entitlement,
	feature,
}: {
	entitlement: Entitlement;
	feature: Feature;
}): EntitlementWithFeature => {
	return { ...entitlement, feature };
};

export const enrichEntitlementsWithFeatures = ({
	entitlements,
	features,
}: {
	entitlements: Entitlement[];
	features: Feature[];
}): EntitlementWithFeature[] => {
	return entitlements.map((ent) => {
		const feature = findFeatureByInternalId({
			features,
			internalId: ent.internal_feature_id,
			errorOnNotFound: true,
		});
		return { ...ent, feature };
	});
};
