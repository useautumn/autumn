import { z } from "zod/v4";
import { ApiCreditSchemaItemSchema } from "./creditRateCard.js";

/**
 * A plan item's partial override of its feature, keyed like ApiFeatureV1 so
 * the override reads as "these feature fields, for customers on this plan".
 * Strict: a key is only admitted once every runtime reader of that field
 * honors the override (credit_schema is the only one so far — invoice_credit
 * and markups have readers outside the schema path).
 */
export const ApiFeatureOverrideSchema = z.strictObject({
	credit_schema: z.array(ApiCreditSchemaItemSchema).optional().meta({
		description:
			"For credit system features: replaces the feature's credit_schema entirely for customers on this plan.",
	}),
});

export type ApiFeatureOverride = z.infer<typeof ApiFeatureOverrideSchema>;
