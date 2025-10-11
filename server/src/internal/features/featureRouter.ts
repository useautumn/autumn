import {
	ApiFeatureSchema,
	ApiFeatureType,
	ErrCode,
	type Feature,
	FeatureType,
	type FeatureUsageType,
	UpdateFeatureParamsSchema,
} from "@autumn/shared";

import express, { type Router } from "express";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { keyToTitle } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { FeatureService } from "./FeatureService.js";
import { validateFeatureId } from "./featureUtils.js";
import { handleDeleteFeature } from "./handlers/handleDeleteFeature.js";
import { handleGetFeatureDeletionInfo } from "./handlers/handleGetFeatureDeletionInfo.js";
import { handleUpdateFeature } from "./handlers/handleUpdateFeature.js";
import { fromApiFeature, toApiFeature } from "./utils/mapFeatureUtils.js";

export const featureRouter: Router = express.Router();

// 1. Get features...
featureRouter.get("", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "list features",
		handler: async () => {
			const includeArchived = req.query.include_archived === "true";
			const features = await FeatureService.list({
				db: req.db,
				orgId: req.orgId,
				env: req.env,
				archived: includeArchived ? undefined : false,
				// showOnlyArchived: includeArchived ? undefined : false,
			});

			res
				.status(200)
				.json({ list: features.map((feature) => toApiFeature({ feature })) });
		},
	}),
);

featureRouter.get("/:featureId", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Get feature",
		handler: async () => {
			const feature = req.features.find(
				(f: Feature) => f.id === req.params.featureId,
			);

			if (!feature) {
				throw new RecaseError({
					message: `Feature with id ${req.params.featureId} not found`,
					code: ErrCode.FeatureNotFound,
					statusCode: 404,
				});
			}

			res.status(200).json(toApiFeature({ feature }));
		},
	}),
);

featureRouter.post("", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Create feature",
		handler: async () => {
			const apiFeature = ApiFeatureSchema.parse(req.body);
			if (!apiFeature.name) {
				apiFeature.name = keyToTitle(apiFeature.id);
			}

			validateFeatureId(apiFeature.id);

			const feature = fromApiFeature({
				apiFeature,
				orgId: req.orgId,
				env: req.env,
			});

			const { db, logger, features: curFeatures } = req;

			const curFeature = curFeatures.find((f: Feature) => f.id === feature.id);

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
	}),
);

featureRouter.post("/:feature_id", async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "Update feature",
		handler: async (req: any, res: any) => {
			const { feature_id: featureId } = req.params;
			const { features: curFeatures } = req;
			const apiFeature = UpdateFeatureParamsSchema.parse(req.body);

			const originalFeature = curFeatures.find(
				(f: Feature) => f.id === featureId,
			);

			if (!originalFeature) {
				throw new RecaseError({
					message: `Feature with id ${featureId} not found`,
					code: ErrCode.FeatureNotFound,
					statusCode: 404,
				});
			}

			// Replace body...
			let featureType = apiFeature.type as unknown as FeatureType;
			let usageType: FeatureUsageType | undefined;
			if (
				apiFeature.type === ApiFeatureType.SingleUsage ||
				apiFeature.type === ApiFeatureType.ContinuousUse
			) {
				featureType = FeatureType.Metered;
				usageType = apiFeature.type as unknown as FeatureUsageType;
			}

			const newConfig = originalFeature.config;

			if (apiFeature.credit_schema) {
				newConfig.schema = apiFeature.credit_schema.map((credit) => ({
					metered_feature_id: credit.metered_feature_id,
					credit_amount: credit.credit_cost,
				}));
			}

			const newBody = {
				id: req.body.id || undefined,
				name: req.body.name || undefined,
				type: featureType,
				usage_type: usageType,
				config: newConfig,
				archived: req.body.archived ?? undefined,
			};

			req.body = newBody;

			await handleUpdateFeature(req, res, true);
		},
	}),
);

featureRouter.delete("/:featureId", handleDeleteFeature);

featureRouter.get("/:feature_id/deletion_info", handleGetFeatureDeletionInfo);
