import { notNullish } from "@/utils/genUtils.js";
import { Entity, Feature, FullCustomerEntitlement } from "@autumn/shared";

export const findMainCusEntForFeature = ({
  cusEnts,
  feature,
}: {
  cusEnts: FullCustomerEntitlement[];
  feature: Feature;
}) => {
  let mainCusEnt = cusEnts.find(
    (e: any) => e.entitlement.feature.internal_id === feature.internal_id,
  );

  return mainCusEnt;
};

export const findLinkedCusEnts = ({
  cusEnts,
  feature,
}: {
  cusEnts: FullCustomerEntitlement[];
  feature: Feature;
}) => {
  return cusEnts.filter(
    (e: any) => e.entitlement.entity_feature_id === feature.id,
  );
};

export const findCusEnt = ({
  feature,
  cusEnts,
  entity,
  onlyUsageAllowed = false,
}: {
  feature: Feature;
  cusEnts: FullCustomerEntitlement[];
  entity?: Entity;
  onlyUsageAllowed?: boolean;
}) => {
  return cusEnts.find((e: any) => {
    let featureMatch =
      e.entitlement.feature.internal_id === feature.internal_id;

    let entityFeatureId = e.entitlement.entity_feature_id;
    let compareEntity = notNullish(entityFeatureId) && notNullish(entity);

    let entityMatch = compareEntity
      ? entityFeatureId === entity!.feature_id
      : true;

    let usageMatch = onlyUsageAllowed ? e.usage_allowed : true;

    return featureMatch && entityMatch && usageMatch;
  });
};
