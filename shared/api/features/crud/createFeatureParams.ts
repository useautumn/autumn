import { FeatureType } from "@models/featureModels/featureEnums";
import { nullish } from "@utils/utils";
import { z } from "zod/v4";
import { BaseFeatureV1ParamsSchema } from "./common/baseFeatureParamsV1";

export const CreateFeatureV1ParamsSchema = BaseFeatureV1ParamsSchema.refine(
	(data: z.infer<typeof BaseFeatureV1ParamsSchema>) => {
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
);

export const CreateFeatureV2ParamsSchema = CreateFeatureV1ParamsSchema.omit({
	id: true,
})
	.extend({
		feature_id: z.string().meta({
			description: "The ID of the feature to create.",
		}),
		name: z.string().meta({
			description: "The name of the feature.",
		}),
	})
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

export type CreateFeatureV1Params = z.infer<typeof CreateFeatureV1ParamsSchema>;
