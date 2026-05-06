// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from @autumn/shared schemas
// Run `pnpm gen:atmn` to regenerate

import { z } from "zod/v4";


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

/**
 * Feature definition with type-safe constraints:
 * - Boolean features cannot have consumable
 * - Metered features require consumable (true = single_use style, false = continuous_use style)
 * - Credit system features are always consumable and require creditSchema
 */
export type Feature = BooleanFeature | MeteredFeature | CreditSystemFeature;

