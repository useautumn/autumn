import { z } from "zod/v4";
import { deductionDeltaSchema } from "../../../deduction/types/deductionDelta.js";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";

/** What a track decided: the verdict, and per-row movement in feature units. The loose half of the log record, and of the reply. */
export const trackResultSchema = z
	.object({
		type: z.literal("track"),
		status: z.enum(["applied", "rejected"]),
		reason: z.literal("insufficient_balance").nullable(),
		/** How much each balance gave, in draw order; empty when rejected. */
		deltas: z.array(deductionDeltaSchema),
		/** The feature the balance is reported in: the tracked one, or the credit system funding it. Absent on records logged before it existed. */
		fundingFeatureId: nonEmptyStringSchema.optional(),
	})
	.loose();

export type TrackResult = z.infer<typeof trackResultSchema>;
