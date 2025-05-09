import RecaseError from "@/utils/errorUtils.js";
import {
  MeteredConfig,
  ErrCode,
  AggregateType,
  CreditSystemConfig,
  Feature,
  FeatureType,
  AppEnv,
  FeatureUsageType,
  Organization,
} from "@autumn/shared";
import { EntitlementService } from "../products/entitlements/EntitlementService.js";
import { PriceService } from "../prices/PriceService.js";
import { FeatureService } from "./FeatureService.js";
import { generateId, keyToTitle } from "@/utils/genUtils.js";
import { StatusCodes } from "http-status-codes";
import { logger } from "@trigger.dev/sdk/v3";
import { generateFeatureDisplay } from "@/external/llm/llmUtils.js";

export const validateFeatureId = (featureId: string) => {
  if (!featureId.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new RecaseError({
      message:
        "Feature ID can only contain alphanumeric characters, underscores, and hyphens",
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }
  return;
};

export const validateMeteredConfig = (config: MeteredConfig) => {
  let newConfig = { ...config };

  if (!config.usage_type) {
    throw new RecaseError({
      message: `Usage type (single or continuous) is required for metered feature`,
      code: ErrCode.InvalidFeature,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

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

  let newConfig = { ...config, usage_type: FeatureUsageType.Single };
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
  let [allEnts, allPrices, { creditSystems }] = await Promise.all([
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
    }),
  ]);

  // console.log("All Ents", allEnts.map((ent) => `${ent.feature_id} - ${ent.entity_feature_id}`));
  // console.log("Matching feature:", feature.id);
  let entitlements = allEnts.filter(
    (entitlement) => entitlement.internal_feature_id == feature.internal_id
  );
  let linkedEntitlements = allEnts.filter(
    (entitlement) => entitlement.entity_feature_id == feature.id
  );

  let prices = allPrices.filter(
    (price) => price.config.internal_feature_id == feature.internal_id
  );
  // console.log("Linked entitlements", linkedEntitlements.map((ent) => `${ent.feature_id} - ${ent.entity_feature_id}`));

  return { entitlements, prices, creditSystems, linkedEntitlements };
};

export const constructBooleanFeature = ({
  featureId,
  orgId,
  env,
}: {
  featureId: string;
  orgId: string;
  env: AppEnv;
}) => {
  let newFeature: Feature = {
    internal_id: generateId("fe"),
    org_id: orgId,
    env,
    created_at: Date.now(),

    id: featureId,
    name: keyToTitle(featureId),
    type: FeatureType.Boolean,
    config: null,
  };

  return newFeature;
};

export const constructMeteredFeature = ({
  featureId,
  orgId,
  env,
  usageType,
}: {
  featureId: string;
  orgId: string;
  env: AppEnv;
  usageType: FeatureUsageType;
}) => {
  let newFeature: Feature = {
    internal_id: generateId("fe"),
    org_id: orgId,
    env,
    created_at: Date.now(),

    id: featureId,
    name: keyToTitle(featureId),
    type: FeatureType.Metered,
    config: {
      filters: [
        {
          property: "event_name",
          operator: "eq",
          value: [],
        },
      ],
      aggregate: {
        type: AggregateType.Sum,
        property: "value",
      },
      usage_type: usageType,
    },
  };

  return newFeature;
};

export const runSaveFeatureDisplayTask = async ({
  sb,
  feature,
  org,
  logger,
}: {
  sb: any;
  feature: Feature;
  org: Organization;
  logger: any;
}) => {
  let display;
  try {
    logger.info(
      `Generating feature display for ${feature.id} (org: ${org.slug})`
    );
    display = await generateFeatureDisplay(feature);
    logger.info(`Result: ${JSON.stringify(display)}`);
    await FeatureService.update({
      sb,
      internalFeatureId: feature.internal_id!,
      updates: {
        display,
      },
    });
  } catch (error) {
    logger.error("failed to generate feature display", {
      error,
      feature,
    });
  }
};
