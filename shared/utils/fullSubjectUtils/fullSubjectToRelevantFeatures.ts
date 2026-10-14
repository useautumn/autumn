import type { FullSubjectView } from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { fullSubjectToCreditSystems } from "./fullSubjectToCreditSystems.js";

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
