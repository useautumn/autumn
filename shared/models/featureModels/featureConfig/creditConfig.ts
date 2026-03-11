import { z } from "zod/v4";
import { FeatureUsageType } from "../featureEnums";

export const CreditSchemaItemSchema = z.object({
	metered_feature_id: z.string(),
	feature_amount: z.number().optional(),
	credit_amount: z.number(),
});

export const CreditSystemConfigSchema = z.object({
	schema: z.array(
		z.object({
			metered_feature_id: z.string(),
			credit_amount: z.number(),
		}),
	),
	usage_type: z.nativeEnum(FeatureUsageType),
});

export const ModelMarkups = z.record(
	z.string(), // Represents the model name in "provider/model" format, e.g. "anthropic/claude-2"
	z.object({
		markup: z.number(), // percentage markup, e.g. 20 for 20%
		humanModelName: z.string().optional(), // e.g. "Claude Opus 4.5" for UI display
	}),
).nullish()

export type CreditSystemConfig = z.infer<typeof CreditSystemConfigSchema>;
export type CreditSchemaItem = z.infer<typeof CreditSchemaItemSchema>;
export type ModelMarkups = z.infer<typeof ModelMarkups>;
