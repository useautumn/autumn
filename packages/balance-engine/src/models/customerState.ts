import { z } from "zod/v4";
import { nonEmptyStringSchema } from "./common/primitives.js";
import { meteringIdentitySchema } from "./meteringIdentity.js";
import { leanCustomerEntitlementSchema } from "./rows/leanCustomerEntitlement.js";

export const customerStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: meteringIdentitySchema,
		revision: z.number().int().nonnegative(),
		customerEntitlements: z.record(
			nonEmptyStringSchema,
			leanCustomerEntitlementSchema,
		),
	})
	.strict()
	.superRefine(({ customerEntitlements }, context) => {
		for (const [id, customerEntitlement] of Object.entries(
			customerEntitlements,
		)) {
			if (customerEntitlement.id === id) continue;
			context.addIssue({
				code: "custom",
				message: `Customer entitlement ${customerEntitlement.id} is stored under key ${id}`,
				path: ["customerEntitlements", id, "id"],
			});
		}
	});

export type CustomerState = z.infer<typeof customerStateSchema>;
