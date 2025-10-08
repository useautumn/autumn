import { z } from "zod/v4";
import { AppEnv } from "../genModels/genEnums.js";
import { FeatureType } from "./featureEnums.js";

export const FeatureSchema = z.object({
	internal_id: z.string(),
	org_id: z.string(),
	created_at: z.number(),
	env: z.nativeEnum(AppEnv),

	id: z.string().nonempty("Features must have an ID"),
	name: z.string().nonempty("Features must have a name"),
	type: z.nativeEnum(FeatureType, {
		message: "Features must have a type",
	}),
	config: z.any(),
	display: z
		.object({
			singular: z.string().optional(),
			plural: z.string().optional(),
		})
		.nullish(),
	archived: z.boolean(),
});

export const CreateFeatureSchema = FeatureSchema.pick({
	id: true,
	name: true,
	type: true,
	config: true,
	display: true,
});

export const MinFeatureSchema = z.object({
	internal_id: z.string(),
	id: z.string(),
	name: z.string(),
	type: z.nativeEnum(FeatureType),
	config: z.any(),
});

export type Feature = z.infer<typeof FeatureSchema>;
export type CreateFeature = z.infer<typeof CreateFeatureSchema>;
