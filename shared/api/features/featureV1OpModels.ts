import { z } from "zod/v4";
import { FeatureType } from "../../models/featureModels/featureEnums.js";
import { nullish } from "../../utils/utils.js";

const featureDescriptions = {
	id: "The ID of the feature. This is used to refer to it in other API calls like /track or /check.",
	name: "The name of the feature.",
	type: "The type of the feature. 'single_use' features are consumed, like API calls, tokens, or messages. 'continuous_use' features are allocated, like seats, workspaces, or projects. 'credit_system' features are schemas that unify multiple 'single_use' features into a single credit system.",
	display:
		"Singular and plural display names for the feature in your user interface.",

	credit_schema:
		"A schema that maps 'single_use' feature IDs to credit costs. Applicable only for 'credit_system' features.",

	archived:
		"Whether the feature is archived. Archived features are hidden from the dashboard and list features endpoint.",
};

// Create Feature Params
export const CreateFeatureV1ParamsSchema = z
	.object({
		id: z.string().nonempty().meta({ description: featureDescriptions.id }),
		name: z
			.string()
			.nonempty()
			.nullish()
			.meta({ description: featureDescriptions.name }),
		type: z.enum(FeatureType).meta({ description: featureDescriptions.type }),
		consumable: z.boolean().optional(),

		display: z
			.object({
				singular: z.string(),
				plural: z.string(),
			})
			.optional()
			.meta({ description: featureDescriptions.display }),

		credit_schema: z
			.array(
				z.object({
					metered_feature_id: z.string(),
					credit_cost: z.number(),
				}),
			)
			.optional()
			.meta({ description: featureDescriptions.credit_schema }),

		event_names: z.array(z.string()).optional(),
	})
	.refine(
		(data) => {
			if (data.type === FeatureType.Metered && nullish(data.consumable)) {
				return false;
			}
			return true;
		},
		{
			message:
				"Please specify whether the feature is consumable (eg. API tokens, credits, etc.) or not.",
			path: ["consumable"],
		},
	)
	.refine(
		(data) => {
			if (
				data.type === FeatureType.CreditSystem &&
				nullish(data.credit_schema)
			) {
				return false;
			}
			return true;
		},
		{
			message: "Please specify the credit schema for the feature.",
			path: ["credit_schema"],
		},
	)
	.refine(
		(data) => {
			if (data.type === FeatureType.CreditSystem && data.consumable === false) {
				return false;
			}
			return true;
		},
		{
			message: "Credit system features must be consumable.",
			path: ["consumable"],
		},
	);

export const UpdateFeatureV1ParamsSchema =
	CreateFeatureV1ParamsSchema.partial().extend({
		archived: z.boolean().optional(),
	});

export type CreateFeatureV1Params = z.infer<typeof CreateFeatureV1ParamsSchema>;
export type UpdateFeatureV1Params = z.infer<typeof UpdateFeatureV1ParamsSchema>;
