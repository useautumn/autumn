import {
  cusEntsContainFeature,
  getUnlimitedAndUsageAllowed,
  getFeatureBalance,
  cusEntsToFeatures,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import {
  Feature,
  CusEntWithEntitlement,
  FullCustomerEntitlement,
  FeatureType,
} from "@autumn/shared";
import { z } from "zod";
const EntitledSchema = z.object({
  customer_id: z.string(),
  feature_id: z.string(),
  required_quantity: z.number(),
});

const getRequiredAndActualBalance = ({
  cusEnts,
  feature,
  originalFeatureId,
  required,
  group,
}: {
  cusEnts: CusEntWithEntitlement[];
  feature: Feature;
  originalFeatureId: string;
  required: number;
  group: any;
}) => {
  let requiredBalance = required;
  if (
    feature.type === FeatureType.CreditSystem &&
    feature.id !== originalFeatureId
  ) {
    requiredBalance = featureToCreditSystem({
      featureId: originalFeatureId,
      creditSystem: feature,
      amount: required,
    });
  }

  const actualBalance = getFeatureBalance({
    cusEnts,
    feature,
    groupVal: group,
    features: cusEntsToFeatures(cusEnts as FullCustomerEntitlement[]),
  });

  return {
    required: requiredBalance,
    actual: actualBalance,
    group,
  };
};

export const getMeteredEntitledResult = ({
  allFeatures,
  originalFeature,
  creditSystems,
  cusEnts,
  quantity,
  group,
}: {
  allFeatures: Feature[];
  originalFeature: Feature;
  creditSystems: Feature[];
  cusEnts: CusEntWithEntitlement[];
  quantity: number;
  group: any;
}) => {
  // If no entitlements -> return false
  if (!cusEnts || cusEnts.length === 0) {
    return {
      allowed: false,
      balances: [],
    };
  }

  let allowed = true;
  const balances = [];

  for (const feature of [originalFeature, ...creditSystems]) {
    // 1. Skip if feature not among cusEnt
    if (!cusEntsContainFeature({ cusEnts, feature })) {
      continue;
    }

    // 2. Handle unlimited / usage allowed features
    let { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
      cusEnts,
      internalFeatureId: feature.internal_id!,
    });

    if (unlimited || usageAllowed) {
      balances.push({
        feature_id: feature.id,
        unlimited,
        usage_allowed: usageAllowed,
        required: null,
        balance: unlimited
          ? null
          : getFeatureBalance({
              cusEnts,
              feature,
              groupVal: group,
              features: allFeatures,
            }),
      });
      continue;
    }

    // 3. Get required and actual balance
    const { required, actual } = getRequiredAndActualBalance({
      cusEnts,
      feature,
      originalFeatureId: originalFeature.id,
      required: quantity,
      group,
    });

    let newBalance: any = {
      feature_id: feature.id,
      required,
      balance: actual,
    };

    // feature.config.group_by will always be defined
    // TODO: Rework this...
    if (group) {
      let groupField = feature.config?.group_by?.property;
      newBalance[groupField] = group;
    }

    balances.push(newBalance);

    allowed = allowed && actual! >= required;
  }

  return {
    allowed,
    balances,
  };
};

// Helper functions
export const getBooleanEntitledResult = ({
  cusEnts,
  res,
  feature,
}: {
  cusEnts: CusEntWithEntitlement[];
  res: any;
  feature: Feature;
}) => {
  const allowed = cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id
  );
  return res.status(200).send({
    allowed,
    balances: allowed
      ? [
          {
            feature_id: feature.id,
            balance: null,
          },
        ]
      : [],
  });
};
