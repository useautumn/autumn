import express, { Router } from "express";
import { FeatureService } from "./FeatureService.js";
import { fromAPIFeature, toAPIFeature } from "./utils/mapFeatureUtils.js";
import {
  APIFeatureSchema,
  APIFeatureType,
  ErrCode,
  Feature,
  FeatureType,
  UpdateAPIFeatureSchema,
} from "@autumn/shared";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { handleUpdateFeature } from "./handlers/handleUpdateFeature.js";
import { handleDeleteFeature } from "./handlers/handleDeleteFeature.js";

export const featureRouter: Router = express.Router();

// 1. Get features...
featureRouter.get("", async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "list features",
    handler: async () => {
      let features = await FeatureService.getFromReq(req);
      res
        .status(200)
        .json({ list: features.map((feature) => toAPIFeature({ feature })) });
    },
  })
);

featureRouter.post("", async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Create feature",
    handler: async () => {
      let apiFeature = APIFeatureSchema.parse(req.body);
      let feature = fromAPIFeature({
        apiFeature,
        orgId: req.orgId,
        env: req.env,
      });

      const { db, logger, features: curFeatures } = req;

      let curFeature = curFeatures.find((f: Feature) => f.id == feature.id);

      if (curFeature) {
        throw new RecaseError({
          message: `Feature with id ${feature.id} already exists`,
          code: ErrCode.DuplicateFeatureId,
          statusCode: 400,
        });
      }

      await FeatureService.insert({ db, data: [feature], logger });

      await addTaskToQueue({
        jobName: JobName.GenerateFeatureDisplay,
        payload: { feature },
      });

      res.status(200).json(apiFeature);
    },
  })
);

featureRouter.post("/:feature_id", async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Update feature",
    handler: async (req: any, res: any) => {
      let { feature_id: featureId } = req.params;
      let { features: curFeatures } = req;
      let apiFeature = UpdateAPIFeatureSchema.parse(req.body);

      let originalFeature = curFeatures.find((f: Feature) => f.id == featureId);
      if (!originalFeature) {
        throw new RecaseError({
          message: `Feature with id ${featureId} not found`,
          code: ErrCode.FeatureNotFound,
          statusCode: 404,
        });
      }

      // Replace body...
      let featureType = apiFeature.type as unknown as FeatureType;
      let usageType = undefined;
      if (
        apiFeature.type == APIFeatureType.SingleUsage ||
        apiFeature.type == APIFeatureType.ContinuousUse
      ) {
        featureType = FeatureType.Metered;
        usageType = apiFeature.type;
      }

      let newConfig = originalFeature.config;
      if (usageType) {
        newConfig.usage_type = usageType;
      }

      if (apiFeature.credit_schema) {
        newConfig.credit_schema = apiFeature.credit_schema.map((credit) => ({
          metered_feature_id: credit.metered_feature_id,
          credit_amount: credit.credit_cost,
        }));
      }

      let newBody = {
        id: req.body.id || undefined,
        name: req.body.name || undefined,
        type: featureType,
        config: newConfig,
      };

      req.body = newBody;

      await handleUpdateFeature(req, null);

      let newFeature = await FeatureService.get({
        db: req.db,
        id: featureId,
        orgId: req.orgId,
        env: req.env,
      });

      res.status(200).json(toAPIFeature({ feature: newFeature }));
    },
  })
);

featureRouter.delete("/:featureId", handleDeleteFeature);
