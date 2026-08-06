import { type Feature, isAnyCreditSystem } from "@autumn/shared";

/** Adds the metered features each selected credit system draws from. */
export const expandCreditSystemFeatureIds = ({
	features,
	featureIds,
}: {
	features: Feature[];
	featureIds: Set<string>;
}): Set<string> => {
	for (const feature of features) {
		if (!isAnyCreditSystem(feature.type)) continue;
		if (!featureIds.has(feature.id)) continue;
		const config = feature.config as
			| { schema?: { metered_feature_id: string }[] }
			| null
			| undefined;
		for (const entry of config?.schema ?? []) {
			featureIds.add(entry.metered_feature_id);
		}
	}
	return featureIds;
};
