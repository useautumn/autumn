import { z } from "zod";
import { Infinite } from "../../productEnums.js";
import { BillingInterval } from "../priceEnums.js";

export enum BillWhen {
	InAdvance = "in_advance",
	StartOfPeriod = "start_of_period",
	EndOfPeriod = "end_of_period",
}

export const UsageTierSchema = z.object({
	to: z.number().or(z.literal(Infinite)),
	amount: z.number(),
});

export const UsagePriceConfigSchema = z.object({
	type: z.string(),
	bill_when: z.nativeEnum(BillWhen),
	billing_units: z.number().nullish(),

	internal_feature_id: z.string(),
	feature_id: z.string(),
	usage_tiers: z.array(UsageTierSchema),
	interval: z.nativeEnum(BillingInterval),
	interval_count: z.number().nullish(),

	// For usage in arrear
	stripe_meter_id: z.string().nullish(),
	stripe_price_id: z.string().nullish(),
	stripe_empty_price_id: z.string().nullish(),
	stripe_product_id: z.string().nullish(),
	stripe_placeholder_price_id: z.string().nullish(),
	stripe_event_name: z.string().nullish(),

	should_prorate: z.boolean().optional(),
});

export type UsagePriceConfig = z.infer<typeof UsagePriceConfigSchema>;
