// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from @autumn/shared schemas
// Run `pnpm gen:atmn` to regenerate

import { z } from "zod/v4";

export const CreditTierSchema = z.object({
	to: z.union([z.number(), z.literal("inf")]),
	creditCost: z.number(),
});

const CreditMatchSchema = z.record(
	z.string(),
	z.union([z.string(), z.number(), z.boolean()]),
);

const CreditDimensionBaseSchema = z.object({
	match: CreditMatchSchema,
	priority: z.number().int().optional(),
});

export const CreditDimensionSchema = z.union([
	CreditDimensionBaseSchema.extend({
		creditCost: z.number(),
		tierBehavior: z.never().optional(),
		tiers: z.never().optional(),
	}),
	CreditDimensionBaseSchema.extend({
		creditCost: z.never().optional(),
		tierBehavior: z.literal("graduated"),
		tiers: z.array(CreditTierSchema),
	}),
]);

export const CreditMultiplierSchema = z.object({
	match: CreditMatchSchema,
	factor: z.number().optional(),
	add: z.number().optional(),
});

const CreditSchemaItemBaseSchema = z.object({
	meteredFeatureId: z.string(),
	billingUnits: z.number().optional(),
	dimensions: z.record(z.string(), CreditDimensionSchema).optional(),
	multipliers: z.record(z.string(), CreditMultiplierSchema).optional(),
});

export const FlatCreditSchemaItemSchema = CreditSchemaItemBaseSchema.extend({
	creditCost: z.number(),
	tierBehavior: z.never().optional(),
	tiers: z.never().optional(),
});

export const GraduatedCreditSchemaItemSchema =
	CreditSchemaItemBaseSchema.extend({
		creditCost: z.never().optional(),
		tierBehavior: z.literal("graduated"),
		tiers: z.array(CreditTierSchema),
	});

export const CreditSchemaItemSchema = z.union([
	FlatCreditSchemaItemSchema,
	GraduatedCreditSchemaItemSchema,
]);

export type CreditSchemaItem = z.infer<typeof CreditSchemaItemSchema>;
export type CreditDimension = z.infer<typeof CreditDimensionSchema>;
export type CreditMultiplier = z.infer<typeof CreditMultiplierSchema>;

export const FeatureSchema = z.object({
	id: z.string().meta({
		description:
			"The unique identifier for this feature, used in /check and /track calls.",
	}),
	name: z.string().meta({
		description:
			"Human-readable name displayed in the dashboard and billing UI.",
	}),
	eventNames: z.array(z.string()).optional().meta({
		description:
			"Event names that trigger this feature's balance. Allows multiple features to respond to a single event.",
	}),
	creditSchema: z.array(CreditSchemaItemSchema).optional().meta({
		description:
			"For credit_system features: maps metered features to flat or graduated credit costs.",
	}),
	archived: z.boolean().meta({
		description:
			"Whether the feature is archived and hidden from the dashboard.",
	}),
});

// Base fields shared by all feature types
type FeatureBase = {
	/** Unique identifier for the feature */
	id: string;
	/** Display name for the feature */
	name: string;
	/** Whether the feature is archived */
	archived?: boolean;
	/** Event names that trigger this feature */
	eventNames?: string[];
	/** Credit schema for credit_system features */
	creditSchema?: CreditSchemaItem[];
};

/** Boolean feature - no consumable field allowed */
export type BooleanFeature = FeatureBase & {
	type: "boolean";
	consumable?: never;
};

/** Metered feature - requires consumable field */
export type MeteredFeature = FeatureBase & {
	type: "metered";
	/** Whether usage is consumed (true) or accumulated (false) */
	consumable: boolean;
};

/** Credit system feature - always consumable */
export type CreditSystemFeature = FeatureBase & {
	type: "credit_system";
	/** Credit systems are always consumable */
	consumable?: true;
	/** Required: defines how credits map to metered features */
	creditSchema: CreditSchemaItem[];
};

export type ModelMarkupEntry = {
	/** Per-model markup override. Omit to inherit provider/global markup. */
	markup?: number;
	inputCost?: number;
	outputCost?: number;
};

export type ProviderMarkupEntry = {
	markup: number;
};

/** AI credit system feature - uses model-based pricing */
export type AiCreditSystemFeature = FeatureBase & {
	type: "ai_credit_system";
	/** Per-model markup overrides (highest priority). */
	modelMarkups?: Record<string, ModelMarkupEntry>;
	/** Default markup applied when no model or provider markup matches. */
	defaultMarkup?: number;
	/** Per-provider default markups, keyed by the first segment of the model id. */
	providerMarkups?: Record<string, ProviderMarkupEntry>;
};

export type Feature =
	| BooleanFeature
	| MeteredFeature
	| CreditSystemFeature
	| AiCreditSystemFeature;
