import { z } from "zod/v4";
import { confirmExpiredLockCommandSchema } from "../../commands/confirmExpiredLock/types/confirmExpiredLockCommand.js";
import { confirmExpiredLockResultSchema } from "../../commands/confirmExpiredLock/types/confirmExpiredLockResult.js";
import { finalizeCommandSchema } from "../../commands/finalize/types/finalizeCommand.js";
import { finalizeResultSchema } from "../../commands/finalize/types/finalizeResult.js";
import { initializeCommandSchema } from "../../commands/initialize/types/initializeCommand.js";
import { initializeResultSchema } from "../../commands/initialize/types/initializeResult.js";
import { resetCommandSchema } from "../../commands/reset/types/resetCommand.js";
import { resetResultSchema } from "../../commands/reset/types/resetResult.js";
import { trackCommandSchema } from "../../commands/track/types/trackCommand.js";
import { trackResultSchema } from "../../commands/track/types/trackResult.js";
import { nonEmptyStringSchema } from "../common/primitives.js";
import { meteringIdentitySchema } from "../identity/meteringIdentity.js";
import { rowChangeSchema } from "./rowChange.js";

// The command as it was sent, parsed loose on the log: a newer command field must not break an older replay.
export const mutationCommandSchema = z.discriminatedUnion("type", [
	trackCommandSchema.loose(),
	initializeCommandSchema.loose(),
	finalizeCommandSchema.loose(),
	confirmExpiredLockCommandSchema.loose(),
	resetCommandSchema.loose(),
]);

export const mutationResultSchema = z.discriminatedUnion("type", [
	trackResultSchema,
	initializeResultSchema,
	finalizeResultSchema,
	confirmExpiredLockResultSchema,
	resetResultSchema,
]);

export const mutationSubjectSchema = z
	.object({
		internalCustomerId: nonEmptyStringSchema,
		internalEntityId: nonEmptyStringSchema.nullable(),
	})
	.strict();

export type MutationSubject = z.infer<typeof mutationSubjectSchema>;

const mutationRevisionSchema = z
	.object({
		before: z.number().int().nonnegative(),
		after: z.number().int().positive(),
	})
	.strict();

/** The fields a command produces; the writer's record adds its receipt on top. */
export const subjectStateMutationShape = {
	schemaVersion: z.literal(1),
	type: z.literal("mutation"),
	id: nonEmptyStringSchema,
	identity: meteringIdentitySchema,
	/** The subject's internal ids, for readers of the log that have no rows to look them up in. Absent on records written before it existed. */
	subject: mutationSubjectSchema.optional(),
	revision: mutationRevisionSchema,
	/** Why: the request, for humans and downstream consumers. Never replayed. */
	command: mutationCommandSchema,
	/** What moved: the only field replay applies. Strict, fixed forever. */
	changes: z.array(rowChangeSchema),
	/** What happened: the verdict and per-row movement. Never replayed. */
	result: mutationResultSchema,
};

type MutationShape = z.infer<z.ZodObject<typeof subjectStateMutationShape>>;

/** The envelope invariants every mutation, bare or recorded, must hold. */
export const refineSubjectStateMutation = (
	mutation: MutationShape,
	context: z.RefinementCtx,
): void => {
	if (mutation.revision.after !== mutation.revision.before + 1) {
		context.addIssue({
			code: "custom",
			message: "revision.after must follow revision.before",
			path: ["revision", "after"],
		});
	}
	if (mutation.command.type !== mutation.result.type) {
		context.addIssue({
			code: "custom",
			message: "result must answer the command that produced it",
			path: ["result", "type"],
		});
	}
	if (mutation.command.commandId !== mutation.id) {
		context.addIssue({
			code: "custom",
			message: "the record id is the command id",
			path: ["id"],
		});
	}
	if (mutation.command.type === "initialize") {
		// An entity initialize joins the customer's log mid-stream; a customer one starts it.
		if (mutation.identity.entityId === null && mutation.revision.before !== 0) {
			context.addIssue({
				code: "custom",
				message: "Initialization must start at revision zero",
				path: ["revision", "before"],
			});
		}
		for (const [index, change] of mutation.changes.entries()) {
			if (change.op === "insert") continue;
			context.addIssue({
				code: "custom",
				message: "Initialization can only insert rows",
				path: ["changes", index, "op"],
			});
		}
	}
};

/** What a command decided: the changes to one subject and the result readers see. Knows nothing about dedup. */
export const subjectStateMutationSchema = z
	.object(subjectStateMutationShape)
	.strict()
	.superRefine(refineSubjectStateMutation);

export type MutationCommand = z.infer<typeof mutationCommandSchema>;
export type MutationResult = z.infer<typeof mutationResultSchema>;
export type SubjectStateMutation = z.infer<typeof subjectStateMutationSchema>;
