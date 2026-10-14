import { z } from "zod/v4";
import {
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";

export const resetRowSchema = z
	.object({
		customerEntitlementId: nonEmptyStringSchema,
		featureId: nonEmptyStringSchema,
		cycleEndedAt: timestampSchema,
		nextResetAt: timestampSchema,
	})
	.loose();

export type ResetRow = z.infer<typeof resetRowSchema>;

export const resetResultSchema = z
	.object({
		type: z.literal("reset"),
		rows: z.array(resetRowSchema),
	})
	.loose();

export type ResetResult = z.infer<typeof resetResultSchema>;
