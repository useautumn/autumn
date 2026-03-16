// AUTO-GENERATED - DO NOT EDIT MANUALLY
// Generated from @autumn/shared schemas
// Run `pnpm gen:atmn` to regenerate

import { z } from "zod/v4";

export const UsageTierSchema = z.object({
  to: z.union([z.number(), z.literal("inf")]),
  amount: z.number(),
});

const BasePriceParamsSchema = z.object({
  amount: z.number(),
  interval: z.union([z.literal("one_off"), z.literal("week"), z.literal("month"), z.literal("quarter"), z.literal("semi_annual"), z.literal("year")]),
  intervalCount: z.number().optional(),
});

const idRegex = /^[a-zA-Z0-9_-]+$/;


export const PlanItemSchema = z.object({
  featureId: z.string().meta({
    description: "The ID of the feature to configure.",
    }),
  included: z.number().optional().meta({
    description:
    "Number of free units included. Balance resets to this each interval for consumable features.",
    }),
  unlimited: z.boolean().optional().meta({
    description: "If true, customer has unlimited access to this feature.",
    }),
  reset: z
    .object({
    interval: z.union([z.literal("one_off"), z.literal("minute"), z.literal("hour"), z.literal("day"), z.literal("week"), z.literal("month"), z.literal("quarter"), z.literal("semi_annual"), z.literal("year")]).meta({
    description:
    "Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.",
    }),
    interval_count: z.number().optional().meta({
    description: "Number of intervals between resets. Defaults to 1.",
    }),
    })
    .optional()
    .meta({
    description:
    "Reset configuration for consumable features. Omit for non-consumable features like seats.",
    }),
  price: z
    .object({
    amount: z.number().optional().meta({
    description:
    "Price per billing_units after included usage. Either 'amount' or 'tiers' is required.",
    }),
    tiers: z.array(UsageTierSchema).optional().meta({
    description:
    "Tiered pricing. Each tier's 'to' does NOT include included amount. Either 'amount' or 'tiers' is required.",
    }),
    tier_behavior: z.union([z.literal("graduated"), z.literal("volume")]).optional(),
    
    interval: z.union([z.literal("week"), z.literal("month"), z.literal("quarter"), z.literal("semi_annual"), z.literal("year")]).meta({
    description:
    "Billing interval. For consumable features, should match reset.interval.",
    }),
    interval_count: z.number().default(1).optional().meta({
    description: "Number of intervals per billing cycle. Defaults to 1.",
    }),
    
    billing_units: z.number().default(1).optional().meta({
    description:
    "Units per price increment. Usage is rounded UP when billed (e.g. billing_units=100 means 101 rounds to 200).",
    }),
    billing_method: z.union([z.literal("prepaid"), z.literal("usage_based")]).meta({
    description:
    "'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.",
    }),
    max_purchase: z.number().optional().meta({
    description:
    "Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total.",
    }),
    })
    .optional()
    .meta({
    description:
    "Pricing for usage beyond included units. Omit for free features.",
    }),
  proration: z
    .object({
    on_increase: z.union([z.literal("prorate"), z.literal("charge_immediately")]).meta({
    description: "Billing behavior when quantity increases mid-cycle.",
    }),
    on_decrease: z.union([z.literal("prorate"), z.literal("refund_immediately"), z.literal("no_action")]).meta({
    description: "Credit behavior when quantity decreases mid-cycle.",
    }),
    })
    .optional()
    .meta({
    description:
    "Proration settings for prepaid features. Controls mid-cycle quantity change billing.",
    }),
  rollover: z
    .object({
    max: z.number().optional().meta({
    description: "Max rollover units. Omit for unlimited rollover.",
    }),
    expiry_duration_type: z.union([z.literal("month"), z.literal("forever")]).meta({
    description: "When rolled over units expire.",
    }),
    expiry_duration_length: z.number().optional().meta({
    description: "Number of periods before expiry.",
    }),
    })
    .optional()
    .meta({
    description:
    "Rollover config for unused units. If set, unused included units carry over.",
    }),
  entityFeatureId: z.string().optional().meta({
    internal: true,
    }),
  entitlementId: z.string().optional().meta({
    internal: true,
    }),
  priceId: z.string().optional().meta({
    internal: true,
    })
});

export const FreeTrialSchema = z.object({
  durationLength: z.number().meta({
    description: "Number of duration_type periods the trial lasts.",
    }),
  durationType: z
    .union([z.literal("day"), z.literal("month"), z.literal("year")])
    .default("month")
    .meta({
    description: "Unit of time for the trial ('day', 'month', 'year').",
    }),
  cardRequired: z.boolean().default(true).meta({
    description:
    "If true, payment method required to start trial. Customer is charged after trial ends.",
    })
});

export const PlanSchema = z.object({
  description: z.string().nullable().default(null).meta({
    description: "Optional description of the plan.",
    }),
  addOn: z.boolean().default(false).meta({
    description:
    "If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group.",
    }),
  autoEnable: z.boolean().default(false).meta({
    description:
    "If true, plan is automatically attached when a customer is created. Use for free tiers.",
    }),
  price: BasePriceParamsSchema.optional().meta({
    description:
    "Base recurring price for the plan. Omit for free or usage-only plans.",
    }),
  items: z.array(PlanItemSchema).optional().meta({
    description:
    "Feature configurations for this plan. Each item defines included units, pricing, and reset behavior.",
    }),
  freeTrial: FreeTrialSchema.optional().meta({
    description:
    "Free trial configuration. Customers can try this plan before being charged.",
    }),
  /** Unique identifier for the plan */
  id: z.string().nonempty().regex(idRegex),
  /** Display name for the plan */
  name: z.string().nonempty(),
  /** Group for organizing plans */
  group: z.string().default("")
});


// Type aliases for literal unions
export type ResetInterval = "one_off" | "minute" | "hour" | "day" | "week" | "month" | "quarter" | "semi_annual" | "year";
export type RolloverExpiryDurationType = "month" | "forever";
export type BillingInterval = "week" | "month" | "quarter" | "semi_annual" | "year";
export type PlanPriceInterval = "one_off" | "week" | "month" | "quarter" | "semi_annual" | "year";
export type BillingMethod = "prepaid" | "usage_based";
export type OnIncrease = "prorate" | "charge_immediately";
export type OnDecrease = "prorate" | "refund_immediately" | "no_action";

// Base type for PlanItem
type PlanItemBase = z.infer<typeof PlanItemSchema>;

// Reset configuration object (for top-level reset)
type ResetConfig = {
  /** How often usage resets (e.g., 'month', 'day') */
  interval: ResetInterval;
  /** Number of intervals between resets (default: 1) */
  intervalCount?: number;
};

// Proration configuration
type ProrationConfig = {
  /** Behavior when quantity increases */
  onIncrease: OnIncrease;
  /** Behavior when quantity decreases */
  onDecrease: OnDecrease;
};

// Rollover configuration
type RolloverConfig = {
  /** Maximum amount that can roll over (null for unlimited) */
  max: number | null;
  /** How long rollover lasts before expiring */
  expiryDurationType: RolloverExpiryDurationType;
  /** Duration length for rollover expiry */
  expiryDurationLength?: number;
};

// Base fields shared by all PlanItem variants
type PlanItemBaseFields = {
  /** Reference to the feature being configured */
  featureId: string;
  /** The entity feature ID of the product item if applicable */
  entityFeatureId?: string | null;
  /** Amount of usage included in this plan */
  included?: number;
  /** Whether usage is unlimited */
  unlimited?: boolean;
  /** Proration rules for quantity changes */
  proration?: ProrationConfig;
  /** Rollover policy for unused usage */
  rollover?: RolloverConfig;
};

// Shared price fields (common to all price variants)
type PriceBaseFields = {
  /** Billing method: 'prepaid' or 'usage_based' */
  billingMethod: BillingMethod;
  /** Number of units per billing cycle */
  billingUnits?: number;
  /** Maximum purchasable quantity */
  maxPurchase?: number;
};

// Price with flat amount (no tiers)
type PriceWithAmount = PriceBaseFields & {
  /** Price amount */
  amount: number;
  /** Cannot have tiers when using flat amount */
  tiers?: never;
};

// Price with graduated tiered pricing (no flat amount per tier)
type PriceWithGraduatedTiers = PriceBaseFields & {
  /** Cannot have flat amount when using tiers */
  amount?: never;
  /** Graduated tiered pricing: each tier's amount applies only to units within that tier */
  tiers: Array<{ to: number | "inf"; amount: number }>;
  /** Graduated: each tier's rate applies only to usage within that tier */
  tierBehavior: "graduated";
};

// Price with volume tiered pricing (flat amount per tier)
type PriceWithVolumeTiers = Omit<PriceBaseFields, "billingMethod"> & {
  /** Volume pricing does not support usage_based billing — use 'prepaid' */
  billingMethod: Exclude<BillingMethod, "usage_based">;
  /** Cannot have flat amount when using tiers */
  amount?: never;
  /** Volume tiered pricing: the tier the total usage falls into applies to all units */
  tiers: Array<{ to: number | "inf"; amount: number; flatAmount?: number }>;
  /** Volume: the rate of the tier the total usage falls into applies to all units */
  tierBehavior: "volume";
};

type PriceWithTiers = PriceWithGraduatedTiers | PriceWithVolumeTiers;

// Price must have either amount OR tiers (not both, not neither)
type PriceAmountOrTiers = PriceWithAmount | PriceWithTiers;

// Price when reset IS defined - interval is forbidden
type PriceWithoutInterval = PriceAmountOrTiers & {
  /** Cannot have interval when using top-level reset */
  interval?: never;
  intervalCount?: never;
};

// Price when reset is NOT defined - interval is required
type PriceWithInterval = PriceAmountOrTiers & {
  /** Billing interval - required when no top-level reset */
  interval: BillingInterval;
  /** Number of intervals between billing cycles (default: 1) */
  intervalCount?: number;
};

/**
 * Plan item with top-level reset configuration.
 * Use this for free allocations or features that reset but aren't priced per-use.
 */
export type PlanItemWithReset = PlanItemBaseFields & {
  /** Reset configuration for usage limits */
  reset: ResetConfig;
  /** Optional pricing (cannot have price.interval when using top-level reset) */
  price?: PriceWithoutInterval;
};

/**
 * Plan item with pricing that includes interval configuration.
 * Use this for usage-based pricing where interval determines billing cycle.
 */
export type PlanItemWithPriceInterval = PlanItemBaseFields & {
  /** Cannot have top-level reset when using price.interval */
  reset?: never;
  /** Pricing configuration with billing interval */
  price: PriceWithInterval;
};

/**
 * Plan item without any reset configuration.
 * Use this for continuous-use features (like seats) that don't reset.
 */
export type PlanItemNoReset = PlanItemBaseFields & {
  /** No reset for continuous-use features */
  reset?: never;
  /** Pricing with required interval (since no top-level reset) */
  price?: PriceWithInterval;
};

/**
 * Plan item configuration with mutually exclusive reset patterns:
 * - PlanItemWithReset: Top-level reset (for free allocations)
 * - PlanItemWithPriceInterval: price.interval (for usage-based pricing billing cycle)
 * - PlanItemNoReset: No reset (for continuous-use features like seats)
 */
export type PlanItem = PlanItemWithReset | PlanItemWithPriceInterval | PlanItemNoReset;


// Override Plan type to use PlanItem discriminated union
type PlanBase = z.infer<typeof PlanSchema>;
export type FreeTrial = z.infer<typeof FreeTrialSchema>;

export type Plan = {
  /** Unique identifier for the plan. */
  id: string;

  /** Display name of the plan. */
  name: string;

  /** Optional description of the plan. */
  description?: string | null;

  /** Group identifier for organizing related plans. Plans in the same group are mutually exclusive. */
  group?: string;

  /** If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group. */
  addOn?: boolean;

  /** If true, plan is automatically attached when a customer is created. Use for free tiers. */
  autoEnable?: boolean;

  /** Base price for the plan */
  price?: {
    /** Price in your currency (e.g., 50 for $50.00) */
    amount: number;

    /** Billing frequency */
    interval: PlanPriceInterval;  }

  /** Feature configurations for this plan. Each item defines included units, pricing, and reset behavior. */
  items?: PlanItem[];

  /** Free trial period before billing begins */
  freeTrial?: FreeTrial | null;
};

