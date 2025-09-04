import {
  getFeatureBalance,
  cusEntsContainFeature,
  getUnlimitedAndUsageAllowed,
  getPaidFeatureBalance,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import {
  FullCustomerEntitlement,
  Feature,
  FeatureType,
  Organization,
} from "@autumn/shared";

const getRequiredAndActualBalance = ({
  cusEnts,
  feature,
  originalFeatureId,
  required,
  entityId,
}: {
  cusEnts: FullCustomerEntitlement[];
  feature: Feature;
  originalFeatureId: string;
  required: number;
  entityId: string;
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
    internalFeatureId: feature.internal_id!,
    entityId,
  });

  return {
    required: requiredBalance,
    actual: actualBalance,
    entityId,
  };
};

export const getV1CheckResponse = ({
  originalFeature,
  creditSystems,
  cusEnts,
  quantity,
  entityId,
  org,
}: {
  originalFeature: Feature;
  creditSystems: Feature[];
  cusEnts: FullCustomerEntitlement[];
  quantity: number;
  entityId: string;
  org: Organization;
}) => {
  // If no entitlements -> return false
  if (!cusEnts || cusEnts.length === 0) {
    return {
      allowed: false,
      balances: [],
    };
  }

  let allowed = false;
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
              internalFeatureId: feature.internal_id!,
              entityId,
            }),
      });
      allowed = true;
      break;
    }

    // 3. Get required and actual balance
    const { required, actual } = getRequiredAndActualBalance({
      cusEnts,
      feature,
      originalFeatureId: originalFeature.id,
      required: quantity,
      entityId,
    });

    let totalPaidAllowance = getPaidFeatureBalance({
      cusEnts,
      internalFeatureId: feature.internal_id!,
    });

    let newBalance: any = {
      feature_id: feature.id,
      required,
      balance: actual,
    };

    if (entityId) {
      newBalance.entity_id = entityId;
    }

    balances.push(newBalance);

    // allowed = allowed && actual! >= required;
    allowed = actual! + (totalPaidAllowance || 0) >= required;

    if (allowed) {
      break;
    }
  }

  return {
    allowed,
    balances,
  };
};
