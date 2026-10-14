import { TrackDeductionSchema } from "@autumn/shared";
import { z } from "zod/v4";
import { deductionDeltaSchema } from "../../../deduction/types/deductionDelta.js";
import { openEnum, openSchema } from "../../../models/common/openSchema.js";
import {
	finiteNumberSchema,
	nonEmptyStringSchema,
} from "../../../models/common/primitives.js";

export const trackResultSchema = z
	.object({
		type: z.literal("track"),
		status: openEnum({
			name: "trackResult.status",
			values: ["applied", "rejected"],
		}),
		reason: z.literal("insufficient_balance").nullable(),
		deltas: z.array(deductionDeltaSchema),
		deductions: z
			.array(
				openSchema({
					name: "trackResult.deductions",
					schema: TrackDeductionSchema,
				}),
			)
			.default([]),
		internalProductId: nonEmptyStringSchema.nullable().default(null),
		fundingFeatureId: nonEmptyStringSchema,
		fundingCreditCost: finiteNumberSchema,
	})
	.loose();

export type TrackResult = z.infer<typeof trackResultSchema>;
