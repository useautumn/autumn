import { z } from "zod/v4";

/** Miscellaneous customer-level configuration flags. */
export const CustomerConfigSchema = z.object({
	ignore_past_due: z.boolean().default(false).meta({
		description:
			"If true, entitlements will still reset on schedule even when the customer's product is in a past_due state.",
	}),
});

export type CustomerConfig = z.infer<typeof CustomerConfigSchema>;

/** Input variant for create/update — all fields optional so callers can patch individually. */
export const CustomerConfigParamsSchema = CustomerConfigSchema.partial();

export type CustomerConfigParams = z.input<typeof CustomerConfigParamsSchema>;
