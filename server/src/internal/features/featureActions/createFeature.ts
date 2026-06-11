import {
	CreateFeatureSchema,
	type Feature,
	FeatureType,
	isAnyCreditSystem,
	type ModelMarkups,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { workflows } from "@/queue/workflows.js";
import { generateId } from "@/utils/genUtils.js";
import { FeatureService } from "../FeatureService.js";
import {
	validateCreditSystem,
	validateCreditSystemSchemaReferences,
	validateMeteredConfig,
} from "../featureUtils.js";

const validateFeature = (data: any, allFeatures: Feature[]) => {
	const featureType = data.type as FeatureType;

	let config = data.config;
	if (featureType === FeatureType.Metered) {
		config = validateMeteredConfig(config);
	} else if (isAnyCreditSystem(featureType)) {
		config = validateCreditSystem(config, featureType);
		if (featureType === FeatureType.CreditSystem) {
			validateCreditSystemSchemaReferences({
				config,
				allFeatures,
				selfFeatureId: data.id,
			});
		}
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
		model_markups?: ModelMarkups;
	};
	skipGenerateDisplay?: boolean;
}

/**
 * Creates a new feature in the database
 * Used by both the API handler and internal operations like product copying
 */
export const createFeature = async ({
	ctx,
	data,
	skipGenerateDisplay = false,
}: CreateFeatureParams): Promise<Feature | null> => {
	const parsedFeature = validateFeature(data, ctx.features);

	const feature: Feature = {
		archived: false,
		internal_id: generateId("fe"),
		org_id: ctx.org.id,
		created_at: Date.now(),
		env: ctx.env,
		...parsedFeature,
		model_markups: data.model_markups ?? null,
	};

	const insertedData = await FeatureService.insert({
		db: ctx.db,
		data: feature,
		logger: ctx.logger,
	});

	if (!skipGenerateDisplay) {
		await workflows.triggerGenerateFeatureDisplay({
			featureId: feature.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
	}

	return insertedData && insertedData.length > 0 ? insertedData[0] : null;
};
