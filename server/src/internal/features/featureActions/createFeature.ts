import { CreateFeatureSchema, type Feature, FeatureType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { FeatureService } from "../FeatureService.js";
import {
	validateCreditSystem,
	validateFeatureId,
	validateMeteredConfig,
} from "../featureUtils.js";

export const validateFeature = (data: any) => {
	const featureType = data.type;

	validateFeatureId(data.id);

	let config = data.config;
	if (featureType === FeatureType.Metered) {
		config = validateMeteredConfig(config);
	} else if (featureType === FeatureType.CreditSystem) {
		config = validateCreditSystem(config);
	}

	const parsedFeature = CreateFeatureSchema.parse({ ...data, config });
	return parsedFeature;
};

interface CreateFeatureParams {
	ctx: AutumnContext;
	data: {
		id: string;
		name: string;
		type: string;
		config?: any;
		event_names?: string[];
	};
}

/**
 * Creates a new feature in the database
 * Used by both the API handler and internal operations like product copying
 */
export const createFeature = async ({
	ctx,
	data,
}: CreateFeatureParams): Promise<Feature | null> => {
	const parsedFeature = validateFeature(data);

	const feature: Feature = {
		archived: false,
		internal_id: generateId("fe"),
		org_id: ctx.org.id,
		created_at: Date.now(),
		env: ctx.env,
		...parsedFeature,
	};

	const insertedData = await FeatureService.insert({
		db: ctx.db,
		data: feature,
		logger: ctx.logger,
	});

	await addTaskToQueue({
		jobName: JobName.GenerateFeatureDisplay,
		payload: {
			feature,
			org: ctx.org,
		},
	});

	return insertedData && insertedData.length > 0 ? insertedData[0] : null;
};
