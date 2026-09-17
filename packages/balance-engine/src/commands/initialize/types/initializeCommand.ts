import { z } from "zod/v4";
import { catalogRowSchema } from "../../../models/catalog/catalogRow.js";
import { mutatingCommandSchema } from "../../../models/common/baseCommand.js";
import {
	nonEmptyStringSchema,
	timestampSchema,
} from "../../../models/common/primitives.js";
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
			identity.customerId !== state.identity.customerId
		) {
			context.addIssue({
				code: "custom",
				message: "Initialization identity must match its state",
				path: ["identity"],
			});
		}
	});

export type InitializeCommand = z.infer<typeof initializeCommandSchema>;

/** The logged echo carries no payload: the rows are the mutation's inserts. */
export const initializeCommandEchoSchema = z
	.object({
		type: z.literal("initialize"),
		requestId: nonEmptyStringSchema,
		occurredAt: timestampSchema,
	})
	.strict();

export type InitializeCommandEcho = z.infer<typeof initializeCommandEchoSchema>;
