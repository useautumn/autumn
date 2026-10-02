import { FeatureType, type Feature } from "@autumn/shared";

export const sortRemoveFeatureIds = ({
	features,
	featureIds,
}: {
	features: Feature[];
	featureIds: string[];
}) => {
	const featureById = new Map(features.map((feature) => [feature.id, feature]));

	return [...featureIds].sort((left, right) => {
		const leftFeature = featureById.get(left);
		const rightFeature = featureById.get(right);
		const leftCredit = leftFeature?.type === FeatureType.CreditSystem;
		const rightCredit = rightFeature?.type === FeatureType.CreditSystem;

		if (leftCredit && !rightCredit) return -1;
		if (!leftCredit && rightCredit) return 1;
		return 0;
	});
};
