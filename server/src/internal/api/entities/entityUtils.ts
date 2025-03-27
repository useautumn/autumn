import { notNullish } from "@/utils/genUtils.js";
import { FullCustomerEntitlement } from "@autumn/shared";

export const getLinkedCusEnt = ({
  linkedFeature,
  cusEnts,
}: {
  linkedFeature: any;
  cusEnts: any;
}) => {
  // Get linked cus ent...
  let linkedCusEnt = cusEnts.find(
    (e: any) => e.entitlement.feature.id === linkedFeature.id
  );

  if (!linkedCusEnt) {
    return null;
  }

  return linkedCusEnt;
};

export const entityFeatureIdExists = ({
  cusEnt,
}: {
  cusEnt: FullCustomerEntitlement;
}) => {
  let ent = cusEnt.entitlement;
  return notNullish(ent.entity_feature_id);
};
