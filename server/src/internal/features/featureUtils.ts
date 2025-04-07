import RecaseError from "@/utils/errorUtils.js";
import { MeteredConfig, ErrCode, AggregateType, CreditSystemConfig, Feature } from "@autumn/shared";
import { EntitlementService } from "../products/entitlements/EntitlementService.js";
import { PriceService } from "../prices/PriceService.js";
import { FeatureService } from "./FeatureService.js";

export const validateMeteredConfig = (config: MeteredConfig) => {
  let newConfig = { ...config };

  // for (const filter of config.filters) {
    // if (filter.value.length == 0) {
    //   throw new RecaseError({
    //     message: `Event name cannot be empty`,
    //     code: ErrCode.InvalidFeature,
    //     statusCode: 400,
    //   });
    // }
  // }
  // if (config.filters.length == 0 || config.filters[0].value.length == 0) {
  //   throw new RecaseError({
  //     message: `Event name is required for metered feature`,
  //     code: ErrCode.InvalidFeature,
  //     statusCode: 400,
  //   });
  // }

  if (config.aggregate?.type == AggregateType.Count) {
    newConfig.aggregate = {
      type: AggregateType.Count,
      property: null,
    }; // to continue testing support for count...
  } else {
    newConfig.aggregate = {
      type: AggregateType.Sum,
      property: "value",
    };
  }

  if (!newConfig.group_by) {
    newConfig.group_by = null;
  }

  return newConfig;
};

export const validateCreditSystem = (config: CreditSystemConfig) => {
  let schema = config.schema;
  if (!schema || schema.length == 0) {
    throw new RecaseError({
      message: `At least one metered feature is required for credit system`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }

  // Check if multiple of the same feature
  const meteredFeatureIds = schema.map(
    (schemaItem) => schemaItem.metered_feature_id
  );
  console.log("Metered feature ids:", meteredFeatureIds);
  const uniqueMeteredFeatureIds = Array.from(new Set(meteredFeatureIds));
  if (meteredFeatureIds.length !== uniqueMeteredFeatureIds.length) {
    throw new RecaseError({
      message: `Credit system contains multiple of the same metered_feature_id`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }

  let newConfig = { ...config };
  for (let i = 0; i < newConfig.schema.length; i++) {
    newConfig.schema[i].feature_amount = 1;

    let creditAmount = parseFloat(newConfig.schema[i].credit_amount.toString());
    if (isNaN(creditAmount)) {
      throw new RecaseError({
        message: `Credit amount should be a number`,
        code: ErrCode.InvalidFeature,
        statusCode: 400,
      });
    }

    newConfig.schema[i].credit_amount = creditAmount;
  }

  return newConfig;
};

export const getObjectsUsingFeature = async ({
  sb,
  orgId,
  env,
  feature,
}: {
  sb: any;
  orgId: string;
  env: any;
  feature: Feature;
}) => {
  let [allEnts, allPrices, {creditSystems}] = await Promise.all([
    EntitlementService.getByOrg({
      sb,
      orgId, 
      env,
    }),
    PriceService.getByOrg({
      sb,
      orgId,
      env,
    }),
    FeatureService.getWithCreditSystems({
      sb,
      orgId,
      env,
      featureId: feature.id,
    })
  ]);


  // console.log("All Ents", allEnts.map((ent) => `${ent.feature_id} - ${ent.entity_feature_id}`));
  // console.log("Matching feature:", feature.id);
  let entitlements = allEnts.filter((entitlement) => entitlement.internal_feature_id == feature.internal_id);
  let linkedEntitlements = allEnts.filter((entitlement) => entitlement.entity_feature_id == feature.id);

  let prices = allPrices.filter((price) => price.config.internal_feature_id == feature.internal_id);
  // console.log("Linked entitlements", linkedEntitlements.map((ent) => `${ent.feature_id} - ${ent.entity_feature_id}`));

  return { entitlements, prices, creditSystems, linkedEntitlements };
}