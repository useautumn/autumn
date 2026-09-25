import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";

/** The grants removed, and the one kept to carry their usage when no other row could. */
export const deleteBalanceResultSchema = z
	.object({
		type: z.literal("deleteBalance"),
		deletedIds: z.array(nonEmptyStringSchema),
		overageCarrierId: nonEmptyStringSchema.nullable(),
	})
	.loose();

export type DeleteBalanceResult = z.infer<typeof deleteBalanceResultSchema>;
