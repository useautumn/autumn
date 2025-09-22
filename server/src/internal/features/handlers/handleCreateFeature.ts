import { Feature } from "@autumn/shared";
import { validateFeature } from "../internalFeatureRouter.js";
import { generateId } from "@/utils/genUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { FeatureService } from "../FeatureService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { handleFrontendReqError } from "@/utils/errorUtils.js";

export const handleCreateFeature = async (req: any, res: any) => {
	try {
		console.log("Trying to create feature");
		const data = req.body;
		let { db, orgId, env, logtail: logger } = req;
		let parsedFeature = validateFeature(data);

		const feature: Feature = {
			archived: false,
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
};
