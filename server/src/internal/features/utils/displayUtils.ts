import { type Feature, Organization } from "@autumn/shared";

export const getFeatureName = ({
	feature,
	plural,
	capitalize = false,
}: {
	feature: Feature;
	plural: boolean;
	capitalize?: boolean;
}) => {
	let featureName = feature.name;

	if (feature.display) {
		if (plural) {
			featureName = feature.display.plural || featureName;
		} else {
			featureName = feature.display.singular || featureName;
		}
	}

	if (capitalize) {
		featureName = featureName.charAt(0).toUpperCase() + featureName.slice(1);
	}

	return featureName;
};

const getFeatureNameWithCapital = ({ feature }: { feature: Feature }) => {
	if (feature.name.length > 0) {
		return `${feature.name.charAt(0).toUpperCase()}${feature.name.slice(1)}`;
	}

	return feature.name;
};
