import { z } from "zod/v4";
import {
	ModelMarkupsSchema,
	ProviderMarkupsSchema,
} from "../../models/featureModels/featureConfig/creditConfig.js";
import { ApiCreditSchemaItemSchema } from "./creditRateCard.js";

const ApiFeatureMarkupsOverrideSchema = z.strictObject({
	default_markup: z.number().min(-100).optional().meta({
		description:
			"Default percentage markup for customers on this plan. Use -100 to make usage free.",
	}),
	provider_markups: ProviderMarkupsSchema.meta({
		description: "Per-provider markup percentages for customers on this plan.",
	}),
	model_markups: ModelMarkupsSchema.meta({
		description: "Per-model markup overrides for customers on this plan.",
	}),
});

/**
 * A plan item's partial override of its feature, keyed like ApiFeatureV1 so
 * the override reads as "these feature fields, for customers on this plan".
 * Strict: a key is only admitted once every runtime reader of that field
 * honors the override (invoice_credit still has readers outside the resolved
 * feature path).
 */
export const ApiFeatureOverrideSchema = z.strictObject({
	credit_schema: z.array(ApiCreditSchemaItemSchema).optional().meta({
		description:
			"For credit system features: replaces the feature's credit_schema entirely for customers on this plan.",
	}),
	markups: ApiFeatureMarkupsOverrideSchema.optional().meta({
		description:
			"For AI credit system features: replaces the feature's markup chain entirely for customers on this plan. An unset level means no markup at that level rather than inheriting the feature's.",
	}),
});

export type ApiFeatureOverride = z.infer<typeof ApiFeatureOverrideSchema>;
