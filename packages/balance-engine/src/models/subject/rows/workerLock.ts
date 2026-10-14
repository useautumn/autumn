import { z } from "zod/v4";
import { deductionDeltaSchema } from "../../../deduction/types/deductionDelta.js";
import { propertiesSchema } from "../../common/json.js";
import { openEnum } from "../../common/openSchema.js";
import {
	nonEmptyStringSchema,
	timestampSchema,
} from "../../common/primitives.js";

/** One open lock as the balance_locks table stores it: the deduction already taken, and the deltas that undo it. */
export const workerLockSchema = z
	.object({
		id: nonEmptyStringSchema,
		org_id: nonEmptyStringSchema,
		env: nonEmptyStringSchema,
		lock_id: nonEmptyStringSchema,
		internal_customer_id: nonEmptyStringSchema,
		customer_id: nonEmptyStringSchema,
		entity_id: nonEmptyStringSchema.nullable(),
		feature_id: nonEmptyStringSchema,
		overage_behavior: openEnum({
			name: "workerLock.overage_behavior",
			values: ["cap", "reject", "overflow"],
		}),
		properties: propertiesSchema,
		/** In draw order; finalize undoes them newest first. */
		deltas: z.array(deductionDeltaSchema),
		expires_at: timestampSchema,
		expiry_action: openEnum({
			name: "workerLock.expiry_action",
			values: ["release", "confirm"],
		}),
		created_at: timestampSchema,
	})
	.loose();

export type WorkerLock = z.infer<typeof workerLockSchema>;

/** What memory keeps of an open lock: enough to refuse a duplicate and to name the row at finalize. The rest stays in Postgres. */
export const openLockSchema = workerLockSchema
	.pick({ id: true, lock_id: true })
	.loose();

export type OpenLock = z.infer<typeof openLockSchema>;
