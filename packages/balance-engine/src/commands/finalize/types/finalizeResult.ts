import { TrackDeductionSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { deductionDeltaSchema } from "../../../deduction/types/deductionDelta.js";
import { openEnum, openSchema } from "../../../models/common/openSchema.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

export const finalizeResultSchema = z
	.object({
		type: z.literal("finalize"),
		status: openEnum({
			name: "finalizeResult.status",
			values: ["applied", "rejected"],
		}),
		reason: z.literal("insufficient_balance").nullable(),
		lockValue: finiteNumberSchema,
		finalValue: finiteNumberSchema,
		deltas: z.array(deductionDeltaSchema),
		deductions: z
			.array(
				openSchema({
					name: "finalizeResult.deductions",
					schema: TrackDeductionSchema,
				}),
			)
			.default([]),
		internalProductId: nonEmptyStringSchema.nullable().default(null),
	})
	.loose();

export type FinalizeResult = z.infer<typeof finalizeResultSchema>;
