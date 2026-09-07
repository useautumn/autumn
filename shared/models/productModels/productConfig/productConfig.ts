import { z } from "zod/v4";

/** Miscellaneous product/plan-level configuration flags. */
export const ProductConfigSchema = z.object({
	ignore_past_due: z.boolean().default(false).meta({
		description:
			"If true, this plan's entitlements remain usable and reset on schedule while past due, overriding the organization's overdue entitlement block.",
	}),
});

export type ProductConfig = z.infer<typeof ProductConfigSchema>;

/** Input variant for create/update — all fields optional so callers can patch individually. */
export const ProductConfigParamsSchema = ProductConfigSchema.partial();

export type ProductConfigParams = z.input<typeof ProductConfigParamsSchema>;
