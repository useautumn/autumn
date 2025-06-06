import { Feature, FullCustomerEntitlement } from "@autumn/shared";

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

export const findCusEntByFeatureId = ({
  cusEnts,
  feature,
}: {
  cusEnts: FullCustomerEntitlement[];
  feature: Feature;
}) => {
  return cusEnts.find(
    (e: any) => e.entitlement.feature.internal_id === feature.internal_id,
  );
};
