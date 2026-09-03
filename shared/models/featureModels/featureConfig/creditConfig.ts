import { z } from "zod/v4";
import { FeatureUsageType } from "../featureEnums.js";

const CreditSchemaItemBaseSchema = z.object({
	metered_feature_id: z.string(),
	feature_amount: z.number().optional(),
});

export const CreditTierSchema = z.object({
	to: z.union([z.number(), z.literal("inf")]),
	credit_amount: z.number(),
});

export const FlatCreditSchemaItemSchema = CreditSchemaItemBaseSchema.extend({
	credit_amount: z.number(),
	tier_behavior: z.never().optional(),
	tiers: z.never().optional(),
});

export const GraduatedCreditSchemaItemSchema =
	CreditSchemaItemBaseSchema.extend({
		credit_amount: z.never().optional(),
		tier_behavior: z.literal("graduated"),
		tiers: z.array(CreditTierSchema),
	});

export const CreditSchemaItemSchema = z.union([
	FlatCreditSchemaItemSchema,
	GraduatedCreditSchemaItemSchema,
]);

const MarkupEntrySchema = z.object({
	markup: z.number().min(-100), // percentage markup, e.g. 20 for 20%, -100 for free
});

export const ProviderMarkupsSchema = z
	.record(
		z.string(), // Provider key from the model name, e.g. "openrouter" in "openrouter/anthropic/claude"
		MarkupEntrySchema,
	)
	.nullish();

export const CreditSystemConfigSchema = z.object({
	schema: z.array(CreditSchemaItemSchema),
	invoice_credit: z.boolean().optional(),
	usage_type: z.nativeEnum(FeatureUsageType),
	default_markup: z.number().min(-100).optional(),
	provider_markups: ProviderMarkupsSchema,
});

/**
 * A plan item's partial override of its feature's config, stored on the
 * entitlement row under the config's own keys so resolving the effective
 * feature is a config spread. Strict: a key is only admitted once every
 * runtime reader of that key honors the override (schema is the only one so
 * far — invoice_credit and markups have readers outside the schema path).
 */
export const FeatureConfigOverrideSchema = z.strictObject({
	schema: z.array(CreditSchemaItemSchema).optional(),
});

/**
 * `<provider>/<model>`, split on the FIRST slash so `openrouter/openai/gpt-4o`
 * keeps its inner one. Rejecting a bare key here only moves an existing failure
 * earlier: `resolveModel` already throws "not found in models.dev pricing data"
 * at track time, which is a billing-time surprise rather than a config error.
 * Shape only — whether the model exists needs the models.dev catalog, and that
 * lookup does not belong on the write path.
 */
export const ModelMarkupsSchema = z
	.record(
		z
			.string()
			.regex(/.+\/.+/, 'Model keys are "<provider>/<model>", e.g. "openai/gpt-4o" or "custom/my-model".'),
		MarkupEntrySchema.extend({
			markup: z.number().min(-100).optional(), // Omit to inherit provider/global markup
			input_cost: z.number().min(0).optional(), // $/M tokens, required for custom/ models
			output_cost: z.number().min(0).optional(), // $/M tokens, required for custom/ models
		}),
	)
	.nullish();

export type CreditSystemConfig = z.infer<typeof CreditSystemConfigSchema>;
export type FeatureConfigOverride = z.infer<typeof FeatureConfigOverrideSchema>;
export type CreditSchemaItem = z.infer<typeof CreditSchemaItemSchema>;
export type CreditTier = z.infer<typeof CreditTierSchema>;
export type ModelMarkups = z.infer<typeof ModelMarkupsSchema>;
export type ProviderMarkups = z.infer<typeof ProviderMarkupsSchema>;
