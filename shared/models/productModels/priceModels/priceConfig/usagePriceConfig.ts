import { z } from "zod/v4";
import { BillingInterval } from "../../intervals/billingInterval";
import { Infinite } from "../../productEnums";

export enum BillWhen {
	InAdvance = "in_advance",
	StartOfPeriod = "start_of_period",
	EndOfPeriod = "end_of_period",
}

export enum TierBehavior {
	Graduated = "graduated",
	VolumeBased = "volume",
}

/**
 * Base tier shape — no refine/transform, safe for OpenAPI/JSON-schema generation.
 * `amount` is optional here (for input schemas where users provide amount OR flat_amount).
 */
const UsageTierBaseSchema = z.object({
	to: z.number().or(z.literal(Infinite)),
	amount: z.number().optional(),
	flat_amount: z.number().optional(),
});

/**
 * API input tier schema (amount optional — user provides amount or flat_amount).
 * Use in create/update param schemas.
 */
export const ApiUsageTierSchema = UsageTierBaseSchema;

/**
 * API output tier schema (amount always present — transform defaults it to 0).
 * Use in response schemas (apiPlanItemV1, apiBalanceV1, etc.).
 */
export const ApiUsageTierOutputSchema = UsageTierBaseSchema.extend({
	amount: z.number(),
});

/**
 * Internal tier schema with validation + transform (amount defaults to 0).
 * Use for internal model parsing, NOT in API schemas (breaks OpenAPI generation).
 */
export const UsageTierSchema = ApiUsageTierSchema
	.refine(
		(val) => val.amount !== undefined || val.flat_amount !== undefined,
		{
			message: "Either amount or flat_amount, or both must be defined",
			path: ["amount", "flat_amount"],
		},
	)
	.transform((val) => ({
		...val,
		amount: val.amount ?? 0,
	}));

export type UsageTier = z.infer<typeof UsageTierSchema>;

export const UsagePriceConfigSchema = z.object({
	type: z.string(),
	bill_when: z.nativeEnum(BillWhen),
	billing_units: z.number().nullish(),

	internal_feature_id: z.string(),
	feature_id: z.string(),
	usage_tiers: z.array(UsageTierSchema),
	interval: z.enum(BillingInterval),
	interval_count: z.number().optional(),

	// For usage in arrear
	stripe_meter_id: z.string().nullish(),
	stripe_price_id: z.string().nullish(),
	stripe_empty_price_id: z.string().nullish(),
	stripe_product_id: z.string().nullish(),
	stripe_placeholder_price_id: z.string().nullish(),
	stripe_event_name: z.string().nullish(),

	// V2 prepaid price
	stripe_prepaid_price_v2_id: z.string().nullish(),

	should_prorate: z.boolean().optional(),
});

export type UsagePriceConfig = z.infer<typeof UsagePriceConfigSchema>;
