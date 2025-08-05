import { CreateFeature, FeatureType, FeatureUsageType } from "@autumn/shared";

export const getDefaultFeature = (entityCreate?: boolean): CreateFeature => {
  return {
    type: FeatureType.Metered,
    config: {
      filters: [
        {
          property: "",
          operator: "",
          value: [],
        },
      ],
      usage_type: entityCreate
        ? FeatureUsageType.Continuous
        : FeatureUsageType.Single,
    },
    name: "",
    id: "",
  };
};
