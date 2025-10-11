import { z } from "zod/v4";
import { AppEnv } from "../genModels/genEnums.js";
import { FeatureType, FeatureUsageType } from "./featureEnums.js";

export const FeatureSchema = z.object({
	internal_id: z.string(),
	org_id: z.string(),
	created_at: z.number(),
	env: z.enum(AppEnv),

	id: z.string().nonempty(),
	name: z.string().nonempty(),
	type: z.enum(FeatureType),
	usage_type: z.enum(FeatureUsageType).nullable(),

	config: z.any(),
	display: z
		.object({
			singular: z.string().optional(),
			plural: z.string().optional(),
		})
		.nullish(),
	archived: z.boolean(),
	event_names: z.array(z.string()).default([]),
});

export const CreateFeatureSchema = FeatureSchema.pick({
	id: true,
	name: true,
	type: true,
	config: true,
	display: true,
	event_names: true,
	usage_type: true,
}).extend({
	usage_type: z.enum(FeatureUsageType).nullish(),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type CreateFeature = z.infer<typeof CreateFeatureSchema>;
