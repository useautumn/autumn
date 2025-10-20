import { CreateFeatureSchema, ErrCode, FeatureType } from "@autumn/shared";
import express, { type Router } from "express";
import { handleDeleteFeature } from "@/internal/features/handlers/handleDeleteFeature.js";
import { handleUpdateFeature } from "@/internal/features/handlers/handleUpdateFeature.js";
import RecaseError, { formatZodError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { FeatureService } from "./FeatureService.js";
import {
	validateCreditSystem,
	validateFeatureId,
	validateMeteredConfig,
} from "./featureUtils.js";
import { handleCreateFeature } from "./handlers/handleCreateFeature.js";
import { handleGetFeatureDeletionInfo } from "./handlers/handleGetFeatureDeletionInfo.js";

export const internalFeatureRouter: Router = express.Router();

internalFeatureRouter.get("", async (req: any, res: any) => {
	try {
		const { showArchived } = req.query;

		if (showArchived !== undefined) {
			// If showArchived is specified, use FeatureService.list with the parameter
			const features = await FeatureService.list({
				db: req.db,
				orgId: req.orgId,
				env: req.env,
				archived: showArchived === "true",
			});
			res.status(200).json({ features });
		} else {
			// If no showArchived parameter, use the original getFromReq method
			const features = await FeatureService.getFromReq(req);
			res.status(200).json({ features });
		}
	} catch (error: any) {
		console.log("Error fetching features:", error);
		res.status(500).json({ error: error.message });
	}
});

export const validateFeature = (data: any) => {
	const featureType = data.type;

	validateFeatureId(data.id);

	let config = data.config;
	if (featureType === FeatureType.Metered) {
		config = validateMeteredConfig(config);
	} else if (featureType === FeatureType.CreditSystem) {
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

internalFeatureRouter.post("", handleCreateFeature);

internalFeatureRouter.get(
	"/data/deletion_text/:feature_id",
	handleGetFeatureDeletionInfo,
);

internalFeatureRouter.post("/:feature_id", handleUpdateFeature as any);
internalFeatureRouter.delete("/:featureId", handleDeleteFeature);
