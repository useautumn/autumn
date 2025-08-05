import RecaseError from "@/utils/errorUtils.js";
import {
  MeteredConfig,
  ErrCode,
  AggregateType,
  CreditSystemConfig,
  Feature,
  FeatureUsageType,
  Organization,
  ProductItemFeatureType,
  FeatureType,
} from "@autumn/shared";
import { FeatureService } from "./FeatureService.js";
import { StatusCodes } from "http-status-codes";
import { generateFeatureDisplay } from "@/external/llm/llmUtils.js";
import { ProductService } from "../products/ProductService.js";
import { getCreditSystemsFromFeature } from "./creditSystemUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

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

  if (newConfig.filters.length == 0) {
    newConfig.filters = [
      {
        property: "",
        operator: "",
        value: [],
      },
    ];
  }

  return newConfig as MeteredConfig;
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
  // console.log("Metered feature ids:", meteredFeatureIds);
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
  db,
  orgId,
  env,
  allFeatures,
  feature,
}: {
  db: DrizzleCli;
  orgId: string;
  env: any;
  allFeatures: Feature[];
  feature: Feature;
}) => {
  let products = await ProductService.listFull({
    db,
    orgId,
    env,
  });

  let allPrices = products.flatMap((p) => p.prices);
  let allEnts = products.flatMap((p) => p.entitlements);
  let creditSystems = getCreditSystemsFromFeature({
    featureId: feature.id,
    features: allFeatures,
  });

  let entitlements = allEnts.filter(
    (entitlement) => entitlement.internal_feature_id == feature.internal_id
  );
  let linkedEntitlements = allEnts.filter(
    (entitlement) => entitlement.entity_feature_id == feature.id
  );

  let prices = allPrices.filter(
    (price) => (price.config as any).internal_feature_id == feature.internal_id
  );

  return { entitlements, prices, creditSystems, linkedEntitlements };
};

export const runSaveFeatureDisplayTask = async ({
  db,
  feature,

  logger,
}: {
  db: DrizzleCli;
  feature: Feature;

  logger: any;
}) => {
  let display;
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.warn(
        "ANTHROPIC_API_KEY is not set, skipping feature display generation"
      );
      return;
    }

    logger.info(`Generating feature display for ${feature.id}`);
    display = await generateFeatureDisplay(feature);
    logger.info(`Result: ${JSON.stringify(display)}`);

    await FeatureService.update({
      db,
      internalId: feature.internal_id!,
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

export const getCusFeatureType = ({ feature }: { feature: Feature }) => {
  if (feature.type == FeatureType.Boolean) {
    return ProductItemFeatureType.Static;
  } else if (feature.type == FeatureType.Metered) {
    if (feature.config.usage_type == FeatureUsageType.Single) {
      return ProductItemFeatureType.SingleUse;
    } else {
      return ProductItemFeatureType.ContinuousUse;
    }
  } else {
    return ProductItemFeatureType.SingleUse;
  }
};

export const isCreditSystem = ({ feature }: { feature: Feature }) => {
  return feature.type == FeatureType.CreditSystem;
};
