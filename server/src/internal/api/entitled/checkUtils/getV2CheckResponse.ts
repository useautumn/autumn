import {
  getFeatureBalance,
  getUnlimitedAndUsageAllowed,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { cusEntMatchesFeature } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils/findCusEntUtils.js";
import { getCusBalances } from "@/internal/customers/cusProducts/cusEnts/cusFeatureUtils/getCusBalances.js";
import { balancesToFeatureResponse } from "@/internal/customers/cusProducts/cusEnts/cusFeatureUtils/balancesToFeatureResponse.js";
import {
  CheckResponseSchema,
  Feature,
  FullCusEntWithFullCusProduct,
  FullCusProduct,
  FullCustomer,
  Organization,
  SuccessCode,
} from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";

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
  const featureToUse = creditSystems.length > 0 ? creditSystems[0] : feature;

  const featureCusEnts = cusEnts.filter((cusEnt) => {
    return cusEntMatchesFeature({ cusEnt, feature: featureToUse });
  });

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

  const cusFeature = cusFeatures[featureToUse.id] || {};

  let allowed = false;
  if (
    (cusFeature && unlimited) ||
    usageAllowed ||
    cusFeature.balance >= (requiredBalance || 1)
  ) {
    allowed = true;
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
