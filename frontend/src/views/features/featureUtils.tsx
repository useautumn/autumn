import {
  AggregateType,
  Feature,
  FeatureType,
  MeteredConfig,
} from "@autumn/shared";
import { toast } from "react-hot-toast";

export const validateFeature = (feature: Feature) => {
  if (feature.type === FeatureType.Metered) {
    const filter = feature.config.filters[0];
    console.log(filter);

    if (filter.value.length === 0) {
      toast.error("At least one filter is required");
      return false;
    }

    const meteredConfig = feature.config as MeteredConfig;
    const aggregate = meteredConfig.aggregate;
    if (aggregate.type === AggregateType.Sum) {
      if (!aggregate.property) {
        toast.error("Aggregate property is required");
        return false;
      }
    }

    if (meteredConfig.group_by) {
      if (!meteredConfig.group_by.property) {
        toast.error("Group by property is required");
        return false;
      }
    }
  }

  return true;
};
