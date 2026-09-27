import { withSpecDefault } from "@utils/common/withSpecDefault.js";
import { z } from "zod/v4";

const IGNORE_PAST_DUE_DESCRIPTION =
	"If true, entitlements attached to this plan will still reset on schedule even when the customer's product is in a past_due state.";

const ANCHOR_TO_MONTH_START_DESCRIPTION =
	"Anchor billing and reset cycles to the 1st of the month (UTC).";

/** Patch inputs omit defaults so changing one flag preserves the others. */
export const ProductConfigParamsSchema = z.object({
	ignore_past_due: withSpecDefault({
		schema: z.boolean().optional(),
		defaultValue: false,
		description: IGNORE_PAST_DUE_DESCRIPTION,
	}),
	anchor_to_month_start: withSpecDefault({
		schema: z.boolean().optional(),
		defaultValue: false,
		description: ANCHOR_TO_MONTH_START_DESCRIPTION,
	}),
});

export const ProductConfigSchema = z.object({
	ignore_past_due: z.boolean().default(false).meta({
		description: IGNORE_PAST_DUE_DESCRIPTION,
	}),
	anchor_to_month_start: withSpecDefault({
		schema: z.boolean().optional(),
		defaultValue: false,
		description: ANCHOR_TO_MONTH_START_DESCRIPTION,
	}),
});

export type ProductConfig = z.infer<typeof ProductConfigSchema>;
export type ProductConfigParams = z.input<typeof ProductConfigParamsSchema>;
