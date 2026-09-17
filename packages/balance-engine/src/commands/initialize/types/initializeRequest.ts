import { z } from "zod/v4";
import { catalogRowSchema } from "../../../models/catalog/catalogRow.js";
import { subjectStateSchema } from "../../../models/subject/subjectState.js";
import { initializeCommandSchema } from "./initializeCommand.js";

/** What the server hands the worker: the command plus the subject's rows and the catalog rows they reference. */
export const initializeRequestSchema = z
	.object({
		command: initializeCommandSchema,
		state: subjectStateSchema,
		// The worker caches these; the log never carries them.
		catalogRows: z.array(catalogRowSchema),
	})
	.strict()
	.superRefine(({ command, state }, context) => {
		const { identity } = command;
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
				path: ["command", "identity"],
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

export type InitializeRequest = z.infer<typeof initializeRequestSchema>;
