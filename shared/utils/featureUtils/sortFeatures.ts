import type { Feature } from "../../models/featureModels/featureModels.js";

export const sortFeatures = ({ features }: { features?: Feature[] }) => {
	if (!features) return features;

	features.sort((a, b) => {
		if (a.archived && !b.archived) return 1;
		if (!a.archived && b.archived) return -1;
		return 0;
	});

	return features;
};
