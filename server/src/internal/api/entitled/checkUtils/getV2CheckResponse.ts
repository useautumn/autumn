import {
  getFeatureBalance,
  getUnlimitedAndUsageAllowed,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { cusEntMatchesFeature } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { getCusBalances } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/getCusBalances.js";
import { balancesToFeatureResponse } from "@/internal/customers/cusUtils/cusFeatureResponseUtils/balancesToFeatureResponse.js";
import {
  CheckResponseSchema,
  Feature,
  FeatureType,
  FullCusEntWithFullCusProduct,
  FullCusProduct,
  FullCustomer,
  Organization,
  SuccessCode,
} from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import { freeTrialsAreSame } from "@/internal/products/free-trials/freeTrialUtils.js";

export const getFeatureToUse = ({
  creditSystems,
  feature,
  cusEnts,
}: {
  creditSystems: Feature[];
  feature: Feature;
  cusEnts: FullCusEntWithFullCusProduct[];
}) => {
  // 1. If there's a credit system
  let featureCusEnts = cusEnts.filter((cusEnt) =>
    cusEntMatchesFeature({ cusEnt, feature }),
  );

  if (creditSystems.length > 0) {
    let creditCusEnts = cusEnts.filter((cusEnt) =>
      cusEntMatchesFeature({ cusEnt, feature: creditSystems[0] }),
    );

    if (creditCusEnts.length > 0) {
      return creditSystems[0];
    }

    if (featureCusEnts.length > 0) {
      return feature;
    }

    return creditSystems[0];
  }

  return feature;
};

export const getV2CheckResponse = async ({
  fullCus,
  cusEnts,
  feature,
  creditSystems,
  org,
  cusProducts,
  requiredBalance,
}: {
  fullCus: FullCustomer;
  cusEnts: FullCusEntWithFullCusProduct[];
  feature: Feature;
  creditSystems: Feature[];
  org: Organization;
  cusProducts: FullCusProduct[];
  requiredBalance?: number;
}) => {
  // 1. Get the feature to use
  const featureToUse = getFeatureToUse({
    creditSystems,
    feature,
    cusEnts,
  });

  const featureCusEnts = cusEnts.filter((cusEnt) =>
    cusEntMatchesFeature({ cusEnt, feature: featureToUse }),
  );

  const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
    cusEnts: featureCusEnts,
    internalFeatureId: featureToUse.internal_id!,
  });

  const cusPrices = cusProducts.flatMap(
    (cusProduct) => cusProduct.customer_prices,
  );
  const balances = await getCusBalances({
    cusEntsWithCusProduct: featureCusEnts,
    cusPrices,
    org,
    entity: fullCus.entity,
  });

  let cusFeatures = balancesToFeatureResponse({
    cusEnts: featureCusEnts,
    balances,
  });

//  cusFeature.balance += overage_limit

  const cusFeature = cusFeatures[featureToUse.id] || {};

  let allowed = false;
  let totalUsageLimit = 0;
  console.log(featureCusEnts.length);
  for (const ent of featureCusEnts) {
    totalUsageLimit += ent.entitlement.usage_limit || 0;
  }

  console.log("Feature Balance", cusFeature.balance);
  console.log("Total Usage Limit", totalUsageLimit);
  console.log("Required Balance", requiredBalance);
  console.log("Current Usage", cusFeature.usage);

  if (
    (cusFeature && unlimited) ||
    usageAllowed ||
    cusFeature.balance >= (requiredBalance || 1)
  ) {
    allowed = true;
  }

  console.log("Included Usage", cusFeature.included_usage);

  if (totalUsageLimit > 0) {
    if ((cusFeature.balance - (requiredBalance || 1)) < -(totalUsageLimit - (cusFeature.included_usage || 0))) {
      allowed = false;
    }
  }

  return CheckResponseSchema.parse({
    customer_id: fullCus.id,
    feature_id: featureToUse.id,
    entity_id: fullCus.entity?.id,
    required_balance: notNullish(requiredBalance) ? requiredBalance : 1,
    code: SuccessCode.FeatureFound,
    allowed,
    ...cusFeature,
  });
};
