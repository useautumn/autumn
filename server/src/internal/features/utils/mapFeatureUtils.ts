import {
  APIFeature,
  APIFeatureType,
  AppEnv,
  Feature,
  FeatureType,
  FeatureUsageType,
} from "@autumn/shared";
import { APIFeatureSchema } from "@autumn/shared";
import {
  constructBooleanFeature,
  constructCreditSystem,
  constructMeteredFeature,
} from "./constructFeatureUtils.js";
import RecaseError from "@/utils/errorUtils.js";

export const toAPIFeature = ({ feature }: { feature: Feature }) => {
  // return FeatureResponseSchema.parse(feature);
  // 1. Get feature type
  let featureType = feature.type;
  if (feature.type == FeatureType.Metered) {
    featureType = feature.config.usage_type;
  }

  return APIFeatureSchema.parse({
    id: feature.id,
    name: feature.name,
    type: featureType,
    display: {
      singular: feature.display?.singular || feature.name,
      plural: feature.display?.plural || feature.name,
    },
  });
};

export const fromAPIFeature = ({
  apiFeature,
  orgId,
  env,
}: {
  apiFeature: APIFeature;
  orgId: string;
  env: AppEnv;
}) => {
  let isMetered =
    apiFeature.type == APIFeatureType.SingleUsage ||
    apiFeature.type == APIFeatureType.ContinuousUse;

  let featureType: FeatureType = isMetered
    ? FeatureType.Metered
    : (apiFeature.type as unknown as FeatureType);

  if (isMetered) {
    return constructMeteredFeature({
      featureId: apiFeature.id,
      name: apiFeature.name || "",
      usageType: apiFeature.type as unknown as FeatureUsageType,
      orgId,
      env,
    });
  }

  if (featureType == FeatureType.CreditSystem) {
    if (!apiFeature.credit_schema || apiFeature.credit_schema.length == 0) {
      throw new RecaseError({
        message: "Credit system schema is required",
        code: "CREDIT_SYSTEM_SCHEMA_REQUIRED",
        statusCode: 400,
      });
    }

    return constructCreditSystem({
      featureId: apiFeature.id,
      name: apiFeature.name || "",
      orgId,
      env,
      schema: apiFeature.credit_schema!,
    });
  }

  return constructBooleanFeature({
    featureId: apiFeature.id,
    name: apiFeature.name || "",
    orgId,
    env,
  });
};
