// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from @autumn/shared schemas
// Run `pnpm gen:atmn` to regenerate

import { z } from "zod/v4";


const ModelMarkupEntrySchema = z.object({
  markup: z.number().meta({ description: "Markup percentage, e.g. 20 for 20%" }),
  inputCost: z.number().optional().meta({ description: "Input cost in $/M tokens (required for custom models)" }),
  outputCost: z.number().optional().meta({ description: "Output cost in $/M tokens (required for custom models)" }),
});

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
  creditSchema: z
    .array(
    z.object({
    metered_feature_id: z.string().meta({
    description:
    "ID of the metered feature that draws from this credit system.",
    }),
    credit_cost: z.number().meta({
    description: "Credits consumed per unit of the metered feature.",
    }),
    }),
    )
    .optional()
    .meta({
    description:
    "For credit_system features: maps metered features to their credit costs.",
    }),
  modelMarkups: z.record(z.string(), ModelMarkupEntrySchema).optional().meta({
    description:
    "For ai_credit_system features: maps model IDs (provider/model format) to markup config.",
    }),
  archived: z.boolean().meta({
    description:
    "Whether the feature is archived and hidden from the dashboard.",
    })
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
  creditSchema?: Array<{
    meteredFeatureId: string;
    creditCost: number;
  }>;
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
  creditSchema: Array<{
    meteredFeatureId: string;
    creditCost: number;
  }>;
};

/** Model markup entry for AI credit systems */
export type ModelMarkupEntry = {
  /** Markup percentage, e.g. 20 for 20% */
  markup: number;
  /** Input cost in $/M tokens (required for custom models) */
  inputCost?: number;
  /** Output cost in $/M tokens (required for custom models) */
  outputCost?: number;
};

/** AI credit system feature - uses model-based pricing */
export type AiCreditSystemFeature = FeatureBase & {
  type: "ai_credit_system";
  /** Maps model IDs (provider/model format) to markup config */
  modelMarkups: Record<string, ModelMarkupEntry>;
};

/**
 * Feature definition with type-safe constraints:
 * - Boolean features cannot have consumable
 * - Metered features require consumable (true = single_use style, false = continuous_use style)
 * - Credit system features are always consumable and require creditSchema
 * - AI credit system features use modelMarkups for per-model pricing
 */
export type Feature = BooleanFeature | MeteredFeature | CreditSystemFeature | AiCreditSystemFeature;

