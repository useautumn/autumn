import { FeatureType } from "@models/featureModels/featureEnums.js";
import { nullish } from "@utils/utils.js";
import { z } from "zod/v4";
import {
	ModelMarkupsSchema,
	ProviderMarkupsSchema,
} from "../../../models/featureModels/featureConfig/creditConfig.js";
import { idRegex } from "../../../utils/utils.js";
import { ApiFlatCreditSchemaItemV2_3Schema } from "./apiFeatureV2_3.js";

const BaseFeatureV2_3ParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex),
	name: z.string().nonempty().optional(),
	type: z.enum(FeatureType),
	consumable: z.boolean().optional(),
	display: z
		.object({
			singular: z.string(),
			plural: z.string(),
		})
		.optional(),
	credit_schema: z.array(ApiFlatCreditSchemaItemV2_3Schema).optional(),
	model_markups: ModelMarkupsSchema.optional(),
	default_markup: z.number().min(-100).optional(),
	provider_markups: ProviderMarkupsSchema.optional(),
	event_names: z.array(z.string()).optional(),
});

export const CreateFeatureRestV2_3ParamsSchema =
	BaseFeatureV2_3ParamsSchema.refine(
		(data) => data.type !== FeatureType.Metered || !nullish(data.consumable),
		{
			message:
				"Please specify whether the feature is consumable (eg. API tokens, credits, etc.) or not.",
			path: ["consumable"],
		},
	);

export const CreateFeatureRpcV2_3ParamsSchema =
	CreateFeatureRestV2_3ParamsSchema.omit({ id: true })
		.extend({
			feature_id: z.string(),
			name: z.string(),
		})
		.refine(
			(data) =>
				data.type !== FeatureType.CreditSystem || !nullish(data.credit_schema),
			{
				message: "Please specify the credit schema for the feature.",
				path: ["credit_schema"],
			},
		)
		.refine(
			(data) =>
				data.type !== FeatureType.CreditSystem || data.consumable !== false,
			{
				message: "Credit system features must be consumable.",
				path: ["consumable"],
			},
		);

export const UpdateFeatureRestV2_3ParamsSchema =
	BaseFeatureV2_3ParamsSchema.partial().extend({
		archived: z.boolean().optional(),
	});

export const UpdateFeatureRpcV2_3ParamsSchema =
	UpdateFeatureRestV2_3ParamsSchema.omit({ id: true }).extend({
		feature_id: z.string(),
		new_feature_id: z.string().optional(),
	});
