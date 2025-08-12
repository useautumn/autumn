import { CreateFeature, FeatureType, FeatureUsageType } from "@autumn/shared";
import { defaultMeteredConfig } from "../metered-features/defaultFeatureConfig";

export const getDefaultFeature = (entityCreate?: boolean): any => {
  if (entityCreate) {
    return {
      type: FeatureType.Metered,
      config: {
        defaultMeteredConfig,
        usage_type: FeatureUsageType.Continuous,
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
