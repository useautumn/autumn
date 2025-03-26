import { getMeteredDeduction } from "@/trigger/deductUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import {
  Feature,
  CusEntWithEntitlement,
  FullCustomerEntitlement,
} from "@autumn/shared";
import { getGroupValFromProperties } from "./groupByUtils.js";
import { cusEntsToFeatures } from "./cusEntUtils.js";

// LINK UTILS
export const checkLinkedFeatureValid = ({
  linkedFeature,
  features,
  cusEnts,
  event,
  logger,
}: {
  linkedFeature: Feature;
  features: Feature[];
  cusEnts: CusEntWithEntitlement[];
  event: any;
  logger: any;
}) => {
  const originalFeature = features.find(
    (f) => linkedFeature.config.group_by?.linked_feature_id == f.id
  );

  const linkedCusEnt = cusEnts.find(
    (cusEnt) =>
      cusEnt.entitlement.internal_feature_id == linkedFeature.internal_id
  );

  const entitlement = linkedCusEnt?.entitlement;
  const groupVal = getGroupValFromProperties({
    properties: event.properties,
    feature: linkedFeature,
  });

  if (!linkedCusEnt || !groupVal || !entitlement?.allowance) {
    return true;
  }

  let value = getMeteredDeduction(originalFeature!, event);
  if (value > 0) {
    let groupBalance = linkedCusEnt.balances?.[groupVal];
    if (notNullish(groupBalance) && !groupBalance!.deleted) {
      logger.warn(
        `   - Linked feature ${linkedFeature.id}, group val ${groupVal} already exists...`
      );
      return false;
    }
  } else if (value < 0) {
    if (!linkedCusEnt.balances?.[groupVal]) {
      logger.warn(
        `   - Linked feature ${linkedFeature.id}, group val ${groupVal} does not exist...`
      );
      return false;
    } else if (linkedCusEnt.balances?.[groupVal]?.deleted) {
      logger.warn(
        `   - Linked feature ${linkedFeature.id}, group val ${groupVal} already deleted...`
      );
      return false;
    }
  }

  return true;
};

export const getLinkedFromCusEnt = ({
  linkedToFeature,
  cusEnts,
}: {
  linkedToFeature: Feature;
  cusEnts: FullCustomerEntitlement[];
}) => {
  const linkedFromFeature = getLinkedFeature({
    originalFeature: linkedToFeature,
    features: cusEntsToFeatures(cusEnts),
  });

  if (!linkedFromFeature) {
    return null;
  }

  const linkedFromCusEnt = getLinkedCusEnt({
    linkedFeature: linkedFromFeature!,
    cusEnts,
  });

  return linkedFromCusEnt;
};

export const getLinkedCusEnt = ({
  linkedFeature,
  cusEnts,
}: {
  linkedFeature: Feature;
  cusEnts: FullCustomerEntitlement[];
}) => {
  const linkedCusEnt = cusEnts.find(
    (cusEnt) =>
      cusEnt.entitlement.internal_feature_id == linkedFeature.internal_id
  );

  return linkedCusEnt;
};

export const getLinkedFeature = ({
  originalFeature,
  features,
}: {
  originalFeature: Feature;
  features: Feature[];
}) => {
  return features.find(
    (f) => f.config.group_by?.linked_feature_id == originalFeature.id
  );
};

export const getOriginalFeature = ({
  linkedFeature,
  features,
}: {
  linkedFeature: Feature;
  features: Feature[];
}) => {
  const originalFeature = features.find(
    (f) => linkedFeature.config.group_by?.linked_feature_id == f.id
  );

  return originalFeature;
};

export const getOriginalCusEnt = ({
  linkedFeature,
  cusEnts,
  features,
}: {
  linkedFeature: Feature;
  cusEnts: FullCustomerEntitlement[];
  features: Feature[];
}) => {
  const originalFeature = getOriginalFeature({
    linkedFeature,
    features,
  });

  const originalCusEnt = cusEnts.find(
    (cusEnt) =>
      cusEnt.entitlement.feature.internal_id == originalFeature!.internal_id
  );

  return originalCusEnt;
};

export const isLinkFrom = ({
  fromFeature,
  toFeature,
}: {
  fromFeature: Feature;
  toFeature: Feature;
}) => {
  return fromFeature.config.group_by?.linked_feature_id == toFeature.id;
};
