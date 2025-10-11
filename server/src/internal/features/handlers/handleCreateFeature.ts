import type { Feature } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { handleFrontendReqError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { FeatureService } from "../FeatureService.js";
import { validateFeature } from "../internalFeatureRouter.js";

export const handleCreateFeature = async (req: any, res: any) => {
	try {
		console.log("Trying to create feature");
		const data = req.body;
		const { db, orgId, env, logtail: logger } = req;
		const parsedFeature = validateFeature(data);

		const feature: Feature = {
			archived: false,
			internal_id: generateId("fe"),
			org_id: orgId,
			created_at: Date.now(),
			env: env,
			...parsedFeature,
			usage_type: parsedFeature.usage_type || null,
		};

		const org = await OrgService.getFromReq(req);
		const insertedData = await FeatureService.insert({
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

		const insertedFeature =
			insertedData && insertedData.length > 0 ? insertedData[0] : null;
		res.status(200).json(insertedFeature);
	} catch (error) {
		handleFrontendReqError({ req, error, res, action: "Create feature" });
	}
};
