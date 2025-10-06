import { z } from "zod/v4";
import { BillingInterval } from "../priceEnums.js";

export const FixedPriceConfigSchema = z.object({
	type: z.string(),
	amount: z.number().min(0),
	interval: z.nativeEnum(BillingInterval),
	interval_count: z.number().nullish(),

	// Usage price fields
	billing_units: z.number().nullish(),
	stripe_price_id: z.string().nullish(),
	stripe_empty_price_id: z.string().nullish(),
	stripe_product_id: z.null().or(z.undefined()),
	feature_id: z.null().or(z.undefined()),
	internal_feature_id: z.null().or(z.undefined()),
});

export type FixedPriceConfig = z.infer<typeof FixedPriceConfigSchema>;
