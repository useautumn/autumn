import { z } from "zod/v4";
import { catalogRowSchema } from "../../../models/catalog/catalogRow.js";
import { subjectStateSchema } from "../../../models/subject/subjectState.js";
import { initializeCommandSchema } from "./initializeCommand.js";

export const initializeRequestSchema = z
	.object({
		command: initializeCommandSchema,
		state: subjectStateSchema,
		catalogRows: z.array(catalogRowSchema),
	})
	.loose()
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
