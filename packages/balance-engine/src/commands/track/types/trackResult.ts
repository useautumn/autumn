import { z } from "zod/v4";
import { finiteNumberSchema } from "../../../models/common/primitives.js";
import { leanCustomerEntitlementSchema } from "../../../models/rows/leanCustomerEntitlement.js";

export const trackResultSchema = z
	.object({
		type: z.literal("track"),
		status: z.enum(["applied", "rejected"]),
		reason: z.literal("insufficient_balance").nullable(),
		requestedValue: finiteNumberSchema.positive(),
		appliedValue: finiteNumberSchema.nonnegative(),
		balanceBefore: finiteNumberSchema,
		balanceAfter: finiteNumberSchema,
		balanceSnapshot: leanCustomerEntitlementSchema,
	})
	.strict();

export type TrackResult = z.infer<typeof trackResultSchema>;
