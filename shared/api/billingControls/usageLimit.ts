import { z } from "zod/v4";
import { DbUsageLimitSchema } from "../../models/cusModels/billingControls/usageLimit.js";
import { BillingControlSourceSchema } from "./billingControlSource.js";

/**
 * Response variant of a usage limit: the stored config plus the usage already
 * consumed in the active window (read from the usage-window counter).
 */
export const ApiUsageLimitSchema = DbUsageLimitSchema.extend({
	usage: z.number().min(0).optional().meta({
		description:
			"Usage consumed in the active interval, stored in the usage-window counter.",
	}),
	source: BillingControlSourceSchema.optional(),
});

export type ApiUsageLimit = z.infer<typeof ApiUsageLimitSchema>;

export const UsageLimitUpdateSchema = z.union([
	ApiUsageLimitSchema,
	ApiUsageLimitSchema.pick({
		feature_id: true,
		filter: true,
		source: true,
		usage: true,
	})
		.required({ usage: true })
		.strict(),
]);

export type UsageLimitUpdate = z.input<typeof UsageLimitUpdateSchema>;

/** Request-side usage limits: entries may also be counter-only writes
 * ({ feature_id, usage }) that leave configuration untouched. */
export const WritableUsageLimitsShape = {
	usage_limits: z.array(UsageLimitUpdateSchema).optional().meta({
		description:
			"List of hard usage caps per feature. An entry with only feature_id and usage sets the current counter without changing configuration.",
	}),
};
