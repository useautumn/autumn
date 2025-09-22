import { FeatureUsageType } from "../featureEnums.js";
import { z } from "zod";

export const CreditSchemaItemSchema = z.object({
	metered_feature_id: z.string(),
	feature_amount: z.number(),
	credit_amount: z.number(),
});

export const CreditSystemConfigSchema = z.object({
	schema: z.array(
		z.object({
			metered_feature_id: z.string(),
			feature_amount: z.number(),
			credit_amount: z.number(),
		}),
	),
	usage_type: z.nativeEnum(FeatureUsageType),
});

export type CreditSystemConfig = z.infer<typeof CreditSystemConfigSchema>;
export type CreditSchemaItem = z.infer<typeof CreditSchemaItemSchema>;
