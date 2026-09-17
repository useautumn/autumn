import { z } from "zod/v4";
import { meteringIdentitySchema } from "../identity/meteringIdentity.js";
import { workerCustomerSchema } from "./rows/workerCustomer.js";
import { workerCustomerEntitlementSchema } from "./rows/workerCustomerEntitlement.js";
import { workerCustomerProductSchema } from "./rows/workerCustomerProduct.js";
import { workerEntitySchema } from "./rows/workerEntity.js";
import { workerRolloverSchema } from "./rows/workerRollover.js";

/** One subject's rows, revisioned by the customer's mutation log: the customer's own (entity null) or one entity's. Catalog rows are referenced by id, never embedded. */
export const subjectStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: meteringIdentitySchema,
		revision: z.number().int().nonnegative(),
		customer: workerCustomerSchema,
		customerProducts: z.array(workerCustomerProductSchema),
		customerEntitlements: z.array(workerCustomerEntitlementSchema),
		rollovers: z.array(workerRolloverSchema),
		entity: workerEntitySchema.nullable(),
	})
	.strict();

export type SubjectState = z.infer<typeof subjectStateSchema>;
