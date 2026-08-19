import { z } from "zod/v4";
import {
	ModelMarkupsSchema,
	ProviderMarkupsSchema,
} from "../../../models/featureModels/featureConfig/creditConfig.js";
import { FeatureType } from "../../../models/featureModels/featureEnums.js";

export const ApiFlatCreditSchemaItemV2_3Schema = z.object({
	metered_feature_id: z.string().meta({
		description:
			"ID of the metered feature that draws from this credit system.",
	}),
	credit_cost: z.number().meta({
		description: "Credits consumed per unit of the metered feature.",
	}),
});

export const ApiFeatureV2_3Schema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(FeatureType),
	consumable: z.boolean(),
	event_names: z.array(z.string()).optional(),
	credit_schema: z.array(ApiFlatCreditSchemaItemV2_3Schema).optional(),
	model_markups: ModelMarkupsSchema.optional(),
	default_markup: z.number().min(-100).optional(),
	provider_markups: ProviderMarkupsSchema.optional(),
	display: z
		.object({
			singular: z.string().nullish(),
			plural: z.string().nullish(),
		})
		.optional(),
	archived: z.boolean(),
});

export type ApiFeatureV2_3 = z.infer<typeof ApiFeatureV2_3Schema>;
