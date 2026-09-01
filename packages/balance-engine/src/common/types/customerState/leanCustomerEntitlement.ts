import { z } from "zod/v4";
import { nonEmptyStringSchema } from "../schemaUtils.js";

// The balance projection of one customer entitlement row: just what the
// engine folds over, not the full cus-ent row the server knows about.
export const leanCustomerEntitlementSchema = z
	.object({
		id: nonEmptyStringSchema,
		balance: z.number(),
		usage: z.number().nonnegative(),
	})
	.strict();

export type LeanCustomerEntitlement = z.infer<
	typeof leanCustomerEntitlementSchema
>;
