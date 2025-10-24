import { handleFrontendReqError } from "@/utils/errorUtils.js";
import { createFeature } from "../featureActions/createFeature.js";

export const handleCreateFeature = async (req: any, res: any) => {
	try {
		console.log("Trying to create feature");
		const data = req.body;

		const insertedFeature = await createFeature({
			ctx: req,
			data,
		});

		res.status(200).json(insertedFeature);
	} catch (error) {
		handleFrontendReqError({ req, error, res, action: "Create feature" });
	}
};
