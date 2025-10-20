import { FeatureType, FeatureUsageType } from "@autumn/shared";
import { defaultMeteredConfig } from "./defaultFeatureConfig";

export const getDefaultFeature = (entityCreate?: boolean): any => {
	if (entityCreate) {
		return {
			type: FeatureType.Metered,
			config: {
				...defaultMeteredConfig,
				usage_type: FeatureUsageType.Continuous,
				filters: [],
			},
			name: "",
			id: "",
		};
	}
	return {
		type: null,
		config: {},
		name: "",
		id: "",
	};
};
