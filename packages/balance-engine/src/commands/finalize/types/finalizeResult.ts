import { TrackDeductionSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { deductionDeltaSchema } from "../../../deduction/types/deductionDelta.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

/** What a finalize decided. Rejected means a confirm above the lock could not be funded: nothing moved and the lock stays open. */
export const finalizeResultSchema = z
	.object({
		type: z.literal("finalize"),
		status: z.enum(["applied", "rejected"]),
		reason: z.literal("insufficient_balance").nullable(),
		/** What the lock had taken, and what it was settled at; their difference is the usage the finalize adds. */
		lockValue: finiteNumberSchema,
		finalValue: finiteNumberSchema,
		/** Every balance the finalize moved: the unwind first, then any further deduction. Empty when rejected. */
		deltas: z.array(deductionDeltaSchema),
		/** The same movement as a usage event reports it; defaulted so records written before it existed still parse. */
		deductions: z.array(TrackDeductionSchema).default([]),
		internalProductId: nonEmptyStringSchema.nullable().default(null),
	})
	.loose();

export type FinalizeResult = z.infer<typeof finalizeResultSchema>;
