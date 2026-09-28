import { z } from "zod/v4";
import { meteringIdentitySchema } from "../identity/meteringIdentity.js";
import { workerCustomerSchema } from "./rows/workerCustomer.js";
import { workerCustomerEntitlementSchema } from "./rows/workerCustomerEntitlement.js";
import { workerCustomerLicenseSchema } from "./rows/workerCustomerLicense.js";
import { workerCustomerPriceSchema } from "./rows/workerCustomerPrice.js";
import { workerCustomerProductSchema } from "./rows/workerCustomerProduct.js";
import { workerEntitySchema } from "./rows/workerEntity.js";
import { openLockSchema } from "./rows/workerLock.js";
import { workerPooledBalanceSchema } from "./rows/workerPooledBalance.js";
import { workerReplaceableSchema } from "./rows/workerReplaceable.js";
import { workerRolloverSchema } from "./rows/workerRollover.js";
import { workerUsageWindowSchema } from "./rows/workerUsageWindow.js";

/** One subject's rows, revisioned by the customer's mutation log: the customer's own (entity null) or one entity's. Catalog rows are referenced by id, never embedded. */
export const subjectStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: meteringIdentitySchema,
		revision: z.number().int().nonnegative(),
		customer: workerCustomerSchema,
		customerProducts: z.array(workerCustomerProductSchema),
		customerPrices: z.array(workerCustomerPriceSchema),
		customerEntitlements: z.array(workerCustomerEntitlementSchema),
		rollovers: z.array(workerRolloverSchema),
		/** Read for `customers.get` only; states stored before replaceables were held have none. */
		replaceables: z.array(workerReplaceableSchema).default([]),
		usageWindows: z.array(workerUsageWindowSchema),
		/** The customer's open locks, ids only; states stored before locks existed have none. */
		openLocks: z.array(openLockSchema).default([]),
		/** The pools behind the customer's pooled rows; states stored before pools existed have none. */
		pooledBalances: z.array(workerPooledBalanceSchema).default([]),
		/** The license pools on the customer's products; states stored before licenses existed have none. */
		customerLicenses: z.array(workerCustomerLicenseSchema).default([]),
		entity: workerEntitySchema.nullable(),
	})
	.strict();

export type SubjectState = z.infer<typeof subjectStateSchema>;
