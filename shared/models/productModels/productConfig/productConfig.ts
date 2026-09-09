import { JSON_SCHEMA_REGISTRY } from "@orpc/zod/zod4";
import { z } from "zod/v4";

const IGNORE_PAST_DUE_DESCRIPTION =
	"If true, entitlements attached to this plan will still reset on schedule even when the customer's product is in a past_due state.";

/** Patch inputs omit defaults so changing one flag preserves the others;
 * the default rides the spec instead, where the CLI reads it. */
const ignorePastDueParam = z.boolean().optional();
JSON_SCHEMA_REGISTRY.add(ignorePastDueParam, {
	description: IGNORE_PAST_DUE_DESCRIPTION,
	default: false,
});

export const ProductConfigParamsSchema = z.object({
	ignore_past_due: ignorePastDueParam,
});

export const ProductConfigSchema = z.object({
	ignore_past_due: z.boolean().default(false).meta({
		description: IGNORE_PAST_DUE_DESCRIPTION,
	}),
});

export type ProductConfig = z.infer<typeof ProductConfigSchema>;
export type ProductConfigParams = z.input<typeof ProductConfigParamsSchema>;
