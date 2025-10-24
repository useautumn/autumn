import { routeHandler } from "@/utils/routerUtils.js";
import { updateFeature } from "../featureActions/updateFeature.js";
import { toApiFeature } from "../utils/mapFeatureUtils.js";

export const handleUpdateFeature = async (
	req: any,
	res: any,
	_fromApi: boolean = false,
) =>
	routeHandler({
		req,
		res,
		action: "Update feature",
		handler: async (req: any, res: any) => {
			const featureId = req.params.feature_id;
			const data = req.body;

			// Use the abstracted updateFeature function
			const updatedFeature = await updateFeature({
				ctx: req,
				featureId,
				updates: data,
			});

			res
				.status(200)
				.json(
					updatedFeature
						? toApiFeature({ feature: updatedFeature })
						: undefined,
				);
		},
	});
