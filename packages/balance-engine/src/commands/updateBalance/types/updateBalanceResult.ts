import { z } from "zod/v4";
import { deductionDeltaSchema } from "../../../deduction/types/deductionDelta.js";

export const updateBalanceResultSchema = z
	.object({
		type: z.literal("updateBalance"),
		deltas: z.array(deductionDeltaSchema),
	})
	.loose();

export type UpdateBalanceResult = z.infer<typeof updateBalanceResultSchema>;
