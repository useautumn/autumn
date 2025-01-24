import { FeatureService } from "@/internal/features/FeatureService.js";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { AggregateType, Feature, FeatureType } from "@autumn/shared";
import { CreateFeatureSchema } from "@autumn/shared";
import express from "express";
import { generateId } from "@/utils/genUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

export const featureApiRouter = express.Router();

export const validateFeature = (data: any) => {
  let featureType = data.type;
  if (featureType == FeatureType.Metered) {
    // 1. Check if property is provided

    let config = data.config;
    if (
      config.aggregate.type == AggregateType.Sum &&
      !config.aggregate.property
    ) {
      throw new RecaseError({
        message: `Property is required for sum aggregate`,
        code: ErrCode.InvalidFeature,
        statusCode: 400,
      });
    }
  }

  try {
    CreateFeatureSchema.parse(data);
  } catch (error: any) {
    throw new RecaseError({
      message: `Invalid feature: ${formatZodError(error)}`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }
};

featureApiRouter.post("", async (req: any, res) => {
  let org = req.org;
  let data = req.body;

  try {
    validateFeature(data);

    let feature: Feature = {
      internal_id: generateId("fe"),
      org_id: org.id,
      created_at: Date.now(),
      env: req.env,
      ...data,
    };

    await FeatureService.insert(req.sb, feature);

    res.status(200).json({ message: "Feature created" });
  } catch (error) {
    handleRequestError({ error, res, action: "Create feature" });
  }
});

featureApiRouter.post("/:feature_id", async (req: any, res) => {
  let featureId = req.params.feature_id;

  let data = req.body;

  try {
    await FeatureService.updateStrict({
      sb: req.sb,
      orgId: req.org.id,
      env: req.env,
      featureId,

      updates: {
        name: data.name || undefined,
        config: data.config || undefined,
      },
    });

    res.status(200).json({ success: true, feature_id: featureId });
  } catch (error) {
    handleRequestError({ error, res, action: "Update feature" });
  }
});

featureApiRouter.delete("/:featureId", async (req: any, res) => {
  let orgId = req.orgId;
  let { featureId } = req.params;

  try {
    // Check if any credit systems are using this feature
    const creditSystems = await FeatureService.getCreditSystemsUsingFeature({
      pg: req.pg,
      orgId,
      featureId,
      env: req.env,
    });

    if (creditSystems.length > 0) {
      throw new RecaseError({
        message: `Feature ${featureId} is used in a credit system`,
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
    handleRequestError({ error, res, action: "Delete feature" });
  }
});
