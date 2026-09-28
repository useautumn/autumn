import { z } from "zod/v4";
import {
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

/** One row refilled: the cycle that ended and the one that began. The balances moved are in the record's changes. */
export const resetRowSchema = z
	.object({
		customerEntitlementId: nonEmptyStringSchema,
		featureId: nonEmptyStringSchema,
		cycleEndedAt: timestampSchema,
		nextResetAt: timestampSchema,
	})
	.strict();

export type ResetRow = z.infer<typeof resetRowSchema>;

export const resetResultSchema = z
	.object({
		type: z.literal("reset"),
		rows: z.array(resetRowSchema),
	})
	.loose();

export type ResetResult = z.infer<typeof resetResultSchema>;
