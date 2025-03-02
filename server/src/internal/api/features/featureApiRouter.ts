import { FeatureService } from "@/internal/features/FeatureService.js";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import {
  AggregateType,
  Feature,
  FeatureResponseSchema,
  FeatureType,
  MeteredConfig,
} from "@autumn/shared";
import { CreateFeatureSchema } from "@autumn/shared";
import express from "express";
import { generateId } from "@/utils/genUtils.js";
import { ErrCode } from "@/errors/errCodes.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";

export const featureApiRouter = express.Router();

const defaultMeteredConfig = (data: any) => {
  let config = data.config;
  config.aggregate = {
    type: AggregateType.Sum,
    property: "value",
  };
  return config;
};

const validateMeteredConfig = (config: MeteredConfig) => {
  let newConfig = { ...config };
  if (config.filters.length == 0 || config.filters[0].value.length == 0) {
    throw new RecaseError({
      message: `Event name is required for metered feature`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
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

  if (!newConfig.group_by) {
    newConfig.group_by = null;
  }

  return newConfig;
};

export const validateFeature = (data: any) => {
  let featureType = data.type;

  let config = data.config;
  if (featureType == FeatureType.Metered) {
    config = validateMeteredConfig(config);
  }

  try {
    const parsedFeature = CreateFeatureSchema.parse({ ...data, config });
    return parsedFeature;
  } catch (error: any) {
    throw new RecaseError({
      message: `Invalid feature: ${formatZodError(error)}`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }
};

featureApiRouter.get("", async (req: any, res) => {
  let features = await FeatureService.getFromReq(req);
  res
    .status(200)
    .json(features.map((feature) => FeatureResponseSchema.parse(feature)));
});

featureApiRouter.post("", async (req: any, res) => {
  let data = req.body;

  try {
    let parsedFeature = validateFeature(data);

    let feature: Feature = {
      internal_id: generateId("fe"),
      org_id: req.orgId,
      created_at: Date.now(),
      env: req.env,
      ...parsedFeature,
    };

    await FeatureService.insert({
      sb: req.sb,
      data: feature,
    });

    res.status(200).json({ message: "Feature created" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Create feature" });
  }
});

featureApiRouter.post("/:feature_id", async (req: any, res) => {
  let featureId = req.params.feature_id;

  let data = req.body;

  try {
    await FeatureService.updateStrict({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      featureId,

      updates: {
        name: data.name || undefined,
        config: data.config ? validateMeteredConfig(data.config) : undefined,
      },
    });

    res.status(200).json({ success: true, feature_id: featureId });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Update feature" });
  }
});

featureApiRouter.delete("/:featureId", async (req: any, res) => {
  let orgId = req.orgId;
  let { featureId } = req.params;

  try {
    const { feature, creditSystems } =
      await FeatureService.getWithCreditSystems({
        sb: req.sb,
        orgId,
        featureId,
        env: req.env,
      });

    if (creditSystems.length > 0) {
      throw new RecaseError({
        message: `Feature ${featureId} is used by credit system ${creditSystems[0].id}`,
        code: ErrCode.InvalidFeature,
        statusCode: 400,
      });
    }

    // Get prices that use this feature
    const ents: any[] = await EntitlementService.getByFeature({
      sb: req.sb,
      orgId,
      internalFeatureId: feature.internal_id,
      env: req.env,
      withProduct: true,
    });

    if (ents.length > 0) {
      throw new RecaseError({
        message: `Feature ${featureId} is used in ${ents[0].product.name}`,
        code: ErrCode.InvalidFeature,
        statusCode: 400,
      });
    }

    await FeatureService.deleteStrict({
      sb: req.sb,
      orgId,
      featureId,
      env: req.env,
    });

    res.status(200).json({ message: "Feature deleted" });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Delete feature" });
  }
});
