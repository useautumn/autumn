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

export const cusEntEntityMatch = ({
  cusEnt,
  entity,
}: {
  cusEnt: FullCustomerEntitlement;
  entity?: Entity;
}) => {
  let entityFeatureId = cusEnt.entitlement.entity_feature_id;
  let compareEntity = notNullish(entityFeatureId) && notNullish(entity);

  let entityMatch = compareEntity
    ? entityFeatureId === entity!.feature_id
    : true;

  return entityMatch;
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
  return cusEnts.find((ce: any) => {
    let featureMatch =
      ce.entitlement.feature.internal_id === feature.internal_id;

    let entityMatch = cusEntEntityMatch({ cusEnt: ce, entity });

    let usageMatch = onlyUsageAllowed ? ce.usage_allowed : true;

    return featureMatch && entityMatch && usageMatch;
  });
};
