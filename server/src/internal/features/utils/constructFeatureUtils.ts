import { AggregateType } from "@autumn/shared";

import { AppEnv, FeatureType, FeatureUsageType } from "@autumn/shared";

import { generateId, keyToTitle } from "@/utils/genUtils.js";
import { Feature } from "@autumn/shared";

export const constructFeature = ({
  id,
  name,
  orgId,
  type,
  env,
  config,
  display,
}: {
  id: string;
  name: string;
  orgId: string;
  type: FeatureType;
  env: AppEnv;
  config: any;
  display: any;
}) => {
  let newFeature: Feature = {
    internal_id: generateId("fe"),
    id,
    name,
    org_id: orgId,
    env,
    created_at: Date.now(),
    type,
    config,
    display,
  };

  return newFeature;
};
export const constructBooleanFeature = ({
  featureId,
  orgId,
  env,
}: {
  featureId: string;
  orgId: string;
  env: AppEnv;
}) => {
  let newFeature: Feature = {
    internal_id: generateId("fe"),
    org_id: orgId,
    env,
    created_at: Date.now(),

    id: featureId,
    name: keyToTitle(featureId),
    type: FeatureType.Boolean,
    config: null,
  };

  return newFeature;
};

export const constructMeteredFeature = ({
  featureId,
  orgId,
  env,
  usageType,
}: {
  featureId: string;
  orgId: string;
  env: AppEnv;
  usageType: FeatureUsageType;
}) => {
  let newFeature: Feature = {
    internal_id: generateId("fe"),
    org_id: orgId,
    env,
    created_at: Date.now(),

    id: featureId,
    name: keyToTitle(featureId),
    type: FeatureType.Metered,
    config: {
      filters: [
        {
          property: "event_name",
          operator: "eq",
          value: [],
        },
      ],
      aggregate: {
        type: AggregateType.Sum,
        property: "value",
      },
      usage_type: usageType,
    },
  };

  return newFeature;
};
