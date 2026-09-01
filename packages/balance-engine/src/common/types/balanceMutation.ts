import { z } from "zod/v4";
import { nonEmptyStringSchema } from "./schemaUtils.js";

// One entitlement's before/after as an outcome carries it: absolute values,
// not deltas, so a fold can verify its preconditions exactly.
export const balanceMutationSchema = z
	.object({
		customerEntitlementId: nonEmptyStringSchema,
		balanceBefore: z.number(),
		balanceAfter: z.number(),
		usageBefore: z.number().nonnegative(),
		usageAfter: z.number().nonnegative(),
	})
	.strict();

export type BalanceMutation = z.infer<typeof balanceMutationSchema>;
