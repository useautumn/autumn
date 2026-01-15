import { RecaseError } from "@api/errors/base/RecaseError.js";
import { FeatureNotFoundError } from "../../../index.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import type {
	Entitlement,
	EntitlementWithFeature,
} from "../../../models/productModels/entModels/entModels.js";

export const enrichEntitlementsWithFeatures = ({
	entitlements,
	features,
}: {
	entitlements: Entitlement[];
	features: Feature[];
}): EntitlementWithFeature[] => {
	return entitlements.map((ent) => {
		const feature = features.find(
			(f) => f.internal_id === ent.internal_feature_id,
		);
		if (!feature) {
			throw new FeatureNotFoundError({
				featureId: ent.feature_id ?? "",
			});
		}
		return { ...ent, feature };
	});
};
