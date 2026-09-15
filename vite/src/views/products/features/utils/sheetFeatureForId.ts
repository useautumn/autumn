import { type Feature, isAnyCreditSystem } from "@autumn/shared";

export const sheetFeatureForId = ({
	features,
	featureId,
}: {
	features: Feature[];
	featureId: string | null;
}) => {
	const selected = features.find((feature) => feature.id === featureId) ?? null;
	if (!selected) {
		return { selectedFeature: null, selectedCreditSystem: null };
	}
	if (isAnyCreditSystem(selected.type)) {
		return { selectedFeature: null, selectedCreditSystem: selected };
	}
	return { selectedFeature: selected, selectedCreditSystem: null };
};
