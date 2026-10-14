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
		replaceables: z.array(workerReplaceableSchema).default([]),
		usageWindows: z.array(workerUsageWindowSchema),
		openLocks: z.array(openLockSchema).default([]),
		pooledBalances: z.array(workerPooledBalanceSchema).default([]),
		customerLicenses: z.array(workerCustomerLicenseSchema).default([]),
		entity: workerEntitySchema.nullable(),
	})
	.loose();

export type SubjectState = z.infer<typeof subjectStateSchema>;
