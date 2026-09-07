import { z } from "zod/v4";
import { FeatureUsageType } from "../featureEnums.js";

export const CreditTierSchema = z.object({
	to: z.union([z.number(), z.literal("inf")]),
	credit_amount: z.number(),
});

const flatCreditRateShape = {
	credit_amount: z.number(),
	tier_behavior: z.never().optional(),
	tiers: z.never().optional(),
};

const graduatedCreditRateShape = {
	credit_amount: z.never().optional(),
	tier_behavior: z.literal("graduated"),
	tiers: z.array(CreditTierSchema),
};

// Event property values are compared as strings at track time.
export const CreditMatchSchema = z.record(
	z.string(),
	// `.pipe(z.string())` gives the OpenAPI exporter a plain output schema; a bare
	// transform is rejected when this record appears in response bodies.
	z
		.union([z.string(), z.number(), z.boolean()])
		.transform(String)
		.pipe(z.string()),
);

const CreditDimensionBaseSchema = z.object({
	match: CreditMatchSchema,
	priority: z.number().int().optional(),
});

export const CreditDimensionSchema = z.union([
	CreditDimensionBaseSchema.extend(flatCreditRateShape),
	CreditDimensionBaseSchema.extend(graduatedCreditRateShape),
]);

export const CreditMultiplierSchema = z
	.object({
		match: CreditMatchSchema,
		factor: z.number().positive().optional(),
		add: z.number().optional(),
	})
	.refine(
		(multiplier) =>
			multiplier.factor !== undefined || multiplier.add !== undefined,
		{
			message: "A multiplier needs a factor or an add",
		},
	);

export const USAGE_ATTRIBUTION_DIMENSION_SEPARATOR = "::";
export const CREDIT_DIMENSION_NAME_MAX_LENGTH = 64;

// Dimension names become usage-attribution keys, so they must stay parseable.
export const CreditDimensionNameSchema = z
	.string()
	.min(1)
	.max(CREDIT_DIMENSION_NAME_MAX_LENGTH)
	.refine((name) => !name.includes(USAGE_ATTRIBUTION_DIMENSION_SEPARATOR), {
		message: `Dimension names cannot contain "${USAGE_ATTRIBUTION_DIMENSION_SEPARATOR}"`,
	});

const CreditSchemaItemBaseSchema = z.object({
	metered_feature_id: z.string(),
	feature_amount: z.number().optional(),
	dimensions: z
		.record(CreditDimensionNameSchema, CreditDimensionSchema)
		.optional(),
	multipliers: z
		.record(CreditDimensionNameSchema, CreditMultiplierSchema)
		.optional(),
});

export const FlatCreditSchemaItemSchema =
	CreditSchemaItemBaseSchema.extend(flatCreditRateShape);

export const GraduatedCreditSchemaItemSchema =
	CreditSchemaItemBaseSchema.extend(graduatedCreditRateShape);

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
			.regex(
				/.+\/.+/,
				'Model keys are "<provider>/<model>", e.g. "openai/gpt-4o" or "custom/my-model".',
			),
		MarkupEntrySchema.extend({
			markup: z.number().min(-100).optional(), // Omit to inherit provider/global markup
			input_cost: z.number().min(0).optional(), // $/M tokens, required for custom/ models
			output_cost: z.number().min(0).optional(), // $/M tokens, required for custom/ models
		}),
	)
	.nullish();

// markups replaces as one unit: its three levels are a single precedence chain.
export const FeatureMarkupsOverrideSchema = z.strictObject({
	default_markup: z.number().min(-100).optional(),
	provider_markups: ProviderMarkupsSchema,
	model_markups: ModelMarkupsSchema,
});

export const FeatureConfigOverrideSchema = z.strictObject({
	schema: z.array(CreditSchemaItemSchema).optional(),
	markups: FeatureMarkupsOverrideSchema.optional(),
});

export type CreditSystemConfig = z.infer<typeof CreditSystemConfigSchema>;
export type FeatureMarkupsOverride = z.infer<
	typeof FeatureMarkupsOverrideSchema
>;
export type FeatureConfigOverride = z.infer<typeof FeatureConfigOverrideSchema>;
export type CreditSchemaItem = z.infer<typeof CreditSchemaItemSchema>;
export type CreditDimension = z.infer<typeof CreditDimensionSchema>;
export type CreditMultiplier = z.infer<typeof CreditMultiplierSchema>;
export type CreditTier = z.infer<typeof CreditTierSchema>;
export type ModelMarkups = z.infer<typeof ModelMarkupsSchema>;
export type ProviderMarkups = z.infer<typeof ProviderMarkupsSchema>;
