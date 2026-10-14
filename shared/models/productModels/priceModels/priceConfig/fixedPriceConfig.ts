import { z } from "zod/v4";
import { BillingInterval } from "../../intervals/billingInterval";
import { PriceCurrencyConfigSchema, UsageTierSchema } from "./usagePriceConfig";

const IgnoredFixedPriceMetadataSchema = z.preprocess(
	(value) => (typeof value === "string" ? null : value),
	z.null().or(z.undefined()),
);

export const FixedPriceConfigSchema = z.object({
	type: z.string(),
	amount: z.number().min(0),
	interval: z.enum(BillingInterval),
	interval_count: z.number().optional(),

	base_currency: z.string().nullish(),
	currencies: z.record(z.string(), PriceCurrencyConfigSchema).nullish(),

	billing_units: z.number().nullish(),
	usage_tiers: z.array(UsageTierSchema).nullish(),
	stripe_price_id: z.string().nullish(),
	stripe_empty_price_id: z.string().nullish(),
	stripe_product_id: z.string().nullish(),
	feature_id: IgnoredFixedPriceMetadataSchema,
	internal_feature_id: IgnoredFixedPriceMetadataSchema,
});

export type FixedPriceConfig = z.infer<typeof FixedPriceConfigSchema>;
