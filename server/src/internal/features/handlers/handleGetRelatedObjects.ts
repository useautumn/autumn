import { getObjectsUsingFeature } from "../featureUtils.js";
import { handleFrontendReqError } from "@/utils/errorUtils.js";

export const handleGetRelatedObjects = async (req: any, res: any) => {
	try {
		const { feature_id } = req.params;
		const feature = req.body.feature;
		const allFeatures = req.body.allFeatures;
		const bodyFeatures = req.features;
		console.log("bodyFeatures", bodyFeatures);
		console.log("feature", feature);
		console.log("allFeatures", allFeatures);
		console.log("feature_id", feature_id);

		const relatedObjects = await getObjectsUsingFeature({
			db: req.db,
			orgId: req.orgId,
			env: req.env,
			feature: req.body.feature,
			allFeatures: req.body.allFeatures,
		});

		const preventions = Object.keys(relatedObjects).filter((key) => relatedObjects[key as keyof typeof relatedObjects].length > 0);

		res.status(200).json({
            preventingCount: preventions.length,
        });
	} catch (error) {
		handleFrontendReqError({
			req,
			error,
			res,
			action: "Get related objects",
		});
	}
};
