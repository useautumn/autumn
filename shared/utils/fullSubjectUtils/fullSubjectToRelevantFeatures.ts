import type { FullSubjectView } from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { fullSubjectToCreditSystems } from "./fullSubjectToCreditSystems.js";

/**
 * The feature plus every credit system that can fund it for this subject —
 * the effective-schema (plan-item feature_override aware) twin of the
 * catalog-only getRelevantFeatures.
 */
export const fullSubjectToRelevantFeatures = ({
	fullSubject,
	featureId,
	features,
}: {
	fullSubject: FullSubjectView;
	featureId: string;
	features: Feature[];
}): Feature[] => {
	const feature = features.find((candidate) => candidate.id === featureId);
	return [
		...(feature ? [feature] : []),
		...fullSubjectToCreditSystems({ fullSubject, featureId, features }),
	];
};
