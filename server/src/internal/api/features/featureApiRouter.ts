import { FeatureService } from "@/internal/features/FeatureService.js";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { handleUpdateFeature } from "./handlers/handleUpdateFeature.js";
import { Feature, MinFeatureSchema, FeatureType } from "@autumn/shared";
import { CreateFeatureSchema } from "@autumn/shared";
import express, { Router } from "express";
import { generateId } from "@/utils/genUtils.js";
import { ErrCode } from "@/errors/errCodes.js";

import {
  validateCreditSystem,
  validateFeatureId,
} from "@/internal/features/featureUtils.js";
import { validateMeteredConfig } from "@/internal/features/featureUtils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleDeleteFeature } from "./handlers/handleDeleteFeature.js";

export const featureApiRouter: Router = express.Router();

export const validateFeature = (data: any) => {
  let featureType = data.type;

  validateFeatureId(data.id);

  let config = data.config;
  if (featureType == FeatureType.Metered) {
    config = validateMeteredConfig(config);
  } else if (featureType == FeatureType.CreditSystem) {
    config = validateCreditSystem(config);
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

export const initNewFeature = ({
  data,
  orgId,
  env,
}: {
  data: any;
  orgId: string;
  env: any;
}) => {
  return {
    ...data,
    org_id: orgId,
    env,
    created_at: Date.now(),
    internal_id: generateId("fe"),
  };
};

featureApiRouter.get("", async (req: any, res) => {
  let features = await FeatureService.getFromReq(req);
  res
    .status(200)
    .json(features.map((feature) => MinFeatureSchema.parse(feature)));
});

featureApiRouter.post("", async (req: any, res) => {
  let data = req.body;

  try {
    let { db, orgId, env, logtail: logger } = req;
    let parsedFeature = validateFeature(data);

    let feature: Feature = {
      internal_id: generateId("fe"),
      org_id: orgId,
      created_at: Date.now(),
      env: env,
      ...parsedFeature,
    };

    let org = await OrgService.getFromReq(req);
    let insertedData = await FeatureService.insert({
      db,
      data: feature,
      logger,
    });

    await addTaskToQueue({
      jobName: JobName.GenerateFeatureDisplay,
      payload: {
        feature,
        org: org,
      },
    });

    let insertedFeature =
      insertedData && insertedData.length > 0 ? insertedData[0] : null;
    res.status(200).json(insertedFeature);
  } catch (error) {
    handleRequestError({ req, error, res, action: "Create feature" });
  }
});

featureApiRouter.post("/:feature_id", handleUpdateFeature);
featureApiRouter.delete("/:featureId", handleDeleteFeature);
