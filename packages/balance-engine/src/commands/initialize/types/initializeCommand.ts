import { z } from "zod/v4";
import { catalogRowSchema } from "../../../models/catalog/catalogRow.js";
import { mutatingCommandSchema } from "../../../models/common/baseCommand.js";
import {
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";
import { workerCustomerSchema } from "../../../models/rows/workerCustomer.js";
import { workerEntitySchema } from "../../../models/rows/workerEntity.js";
import { subjectStateSchema } from "../../../models/subjectState.js";

export const initializeCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("initialize"),
		state: subjectStateSchema,
		// The catalog rows the state references; the worker caches them, the log never carries them.
		catalogRows: z.array(catalogRowSchema),
	})
	.strict()
	.superRefine(({ identity, state }, context) => {
		if (state.revision !== 0) {
			context.addIssue({
				code: "custom",
				message: "Initialization must start at revision zero",
				path: ["state", "revision"],
			});
		}
		if (
			identity.orgId !== state.identity.orgId ||
			identity.env !== state.identity.env ||
			identity.customerId !== state.identity.customerId ||
			identity.entityId !== state.identity.entityId
		) {
			context.addIssue({
				code: "custom",
				message: "Initialization identity must match its state",
				path: ["identity"],
			});
		}

		// The split relies on it: a customer initialize carries customer-level rows,
		// an entity initialize carries its entity and that entity's rows.
		if ((state.entity?.id ?? null) !== identity.entityId) {
			context.addIssue({
				code: "custom",
				message: "Initialization must carry the entity its identity names",
				path: ["state", "entity"],
			});
		}
		const ownerInternalId = state.entity?.internal_id ?? null;
		const ownedRows = [
			...state.customerProducts,
			...state.customerEntitlements,
		];
		if (ownedRows.some((row) => row.internal_entity_id !== ownerInternalId)) {
			context.addIssue({
				code: "custom",
				message: "Initialization rows must belong to the initialized subject",
				path: ["state"],
			});
		}
	});

export type InitializeCommand = z.infer<typeof initializeCommandSchema>;

/** The logged echo carries the subject it admits; the rows are the mutation's inserts. */
export const initializeCommandEchoSchema = z
	.object({
		type: z.literal("initialize"),
		requestId: nonEmptyStringSchema,
		occurredAt: timestampSchema,
		customer: workerCustomerSchema,
		entity: workerEntitySchema.nullable(),
	})
	.strict();

export type InitializeCommandEcho = z.infer<typeof initializeCommandEchoSchema>;
