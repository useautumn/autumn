import { z } from "zod/v4";

/** Patch inputs omit defaults so changing one flag preserves the others. */
export const ProductConfigParamsSchema = z.object({
	ignore_past_due: z.boolean().optional().meta({
		description:
			"If true, entitlements attached to this plan will still reset on schedule even when the customer's product is in a past_due state.",
	}),
	allow_overdue_entitlements: z.boolean().optional().meta({
		description:
			"If true, this plan's entitlements remain usable while past due, overriding the organization's overdue entitlement block without changing cancellation or reset behavior.",
	}),
});

export const ProductConfigSchema = ProductConfigParamsSchema.extend({
	ignore_past_due:
		ProductConfigParamsSchema.shape.ignore_past_due.default(false),
	allow_overdue_entitlements:
		ProductConfigParamsSchema.shape.allow_overdue_entitlements
			.default(false)
			.optional(),
});

export type ProductConfig = z.infer<typeof ProductConfigSchema>;
export type ProductConfigParams = z.input<typeof ProductConfigParamsSchema>;
