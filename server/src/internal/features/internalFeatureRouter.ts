import express, { Router } from "express";

import { FeatureService } from "./FeatureService.js";
import {
  ErrCode,
  Feature,
  FeatureType,
  MinFeatureSchema,
} from "@autumn/shared";
import { validateCreditSystem, validateFeatureId } from "./featureUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { handleUpdateFeature } from "@/internal/features/handlers/handleUpdateFeature.js";
import { handleDeleteFeature } from "@/internal/features/handlers/handleDeleteFeature.js";
import RecaseError, {
  formatZodError,
  handleFrontendReqError,
} from "@/utils/errorUtils.js";
import { validateMeteredConfig } from "./featureUtils.js";
import { CreateFeatureSchema } from "@autumn/shared";
import { OrgService } from "../orgs/OrgService.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";

export const internalFeatureRouter: Router = express.Router();

internalFeatureRouter.get("", async (req: any, res: any) => {
  try {
    let features = await FeatureService.getFromReq(req);
    res.status(200).json({ features });
  } catch (error: any) {
    console.log("Error fetching features:", error);
    res.status(500).json({ error: error.message });
  }
});

internalFeatureRouter.get("", async (req: any, res) => {
  let features = await FeatureService.getFromReq(req);
  res
    .status(200)
    .json(features.map((feature) => MinFeatureSchema.parse(feature)));
});

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

internalFeatureRouter.post("", async (req: any, res) => {
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
    handleFrontendReqError({ req, error, res, action: "Create feature" });
  }
});

internalFeatureRouter.post("/:feature_id", handleUpdateFeature);
internalFeatureRouter.delete("/:featureId", handleDeleteFeature);
