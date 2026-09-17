import { z } from "zod/v4";
import { finiteNumberSchema } from "../../../models/common/primitives.js";
import { workerCustomerEntitlementSchema } from "../../../models/rows/workerCustomerEntitlement.js";

export const trackResultSchema = z
	.object({
		type: z.literal("track"),
		status: z.enum(["applied", "rejected"]),
		reason: z.literal("insufficient_balance").nullable(),
		requestedValue: finiteNumberSchema.positive(),
		appliedValue: finiteNumberSchema.nonnegative(),
		balanceBefore: finiteNumberSchema,
		balanceAfter: finiteNumberSchema,
		// The funding row after the track; the caller projects it with its own catalog.
		customerEntitlement: workerCustomerEntitlementSchema,
	})
	.strict();

export type TrackResult = z.infer<typeof trackResultSchema>;
