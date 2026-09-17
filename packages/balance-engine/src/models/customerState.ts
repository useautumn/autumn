import { z } from "zod/v4";
import { meteringIdentitySchema } from "./meteringIdentity.js";
import { workerCustomerEntitlementSchema } from "./rows/workerCustomerEntitlement.js";
import { workerCustomerProductSchema } from "./rows/workerCustomerProduct.js";
import { workerEntitySchema } from "./rows/workerEntity.js";
import { workerRolloverSchema } from "./rows/workerRollover.js";

/** The customer's own rows, revisioned by the mutation log. Catalog rows are referenced by id, never embedded. */
export const customerStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: meteringIdentitySchema,
		revision: z.number().int().nonnegative(),
		customerProducts: z.array(workerCustomerProductSchema),
		customerEntitlements: z.array(workerCustomerEntitlementSchema),
		rollovers: z.array(workerRolloverSchema),
		entities: z.array(workerEntitySchema),
	})
	.strict();

export type CustomerState = z.infer<typeof customerStateSchema>;
