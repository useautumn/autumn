import { z } from "zod/v4";
import { applyBillingPlanResultSchema } from "../../commands/applyBillingPlan/types/applyBillingPlanResult.js";
import { confirmExpiredLockResultSchema } from "../../commands/confirmExpiredLock/types/confirmExpiredLockResult.js";
import { deleteBalanceResultSchema } from "../../commands/deleteBalance/types/deleteBalanceResult.js";
import { evictResultSchema } from "../../commands/evict/types/evictResult.js";
import { finalizeResultSchema } from "../../commands/finalize/types/finalizeResult.js";
import { initializeResultSchema } from "../../commands/initialize/types/initializeResult.js";
import { recalculateBalanceResultSchema } from "../../commands/recalculateBalance/types/recalculateBalanceResult.js";
import { resetResultSchema } from "../../commands/reset/types/resetResult.js";
import { trackResultSchema } from "../../commands/track/types/trackResult.js";
import { updateBalanceResultSchema } from "../../commands/updateBalance/types/updateBalanceResult.js";
import type { MutatingCommand } from "../command/mutatingCommand.js";
import { nonEmptyStringSchema } from "../common/primitives.js";
import { meteringIdentitySchema } from "../identity/meteringIdentity.js";
import {
	changesInsertCustomer,
	rowChangeSchema,
	skipUnknownRowChanges,
} from "./rowChange.js";

/** The command as it was sent, cast rather than parsed: never replayed, so a newer writer's fields must not break an older reader. */
const mutationCommandSchema = z.custom<MutationCommand>(
	(value) => typeof value === "object" && value !== null,
);

export const mutationResultSchema = z.discriminatedUnion("type", [
	trackResultSchema,
	initializeResultSchema,
	finalizeResultSchema,
	confirmExpiredLockResultSchema,
	resetResultSchema,
	applyBillingPlanResultSchema,
	updateBalanceResultSchema,
	deleteBalanceResultSchema,
	recalculateBalanceResultSchema,
	evictResultSchema,
]);

export const mutationSubjectSchema = z
	.object({
		internalCustomerId: nonEmptyStringSchema,
		internalEntityId: nonEmptyStringSchema.nullable(),
	})
	.loose();

export type MutationSubject = z.infer<typeof mutationSubjectSchema>;

const mutationRevisionSchema = z
	.object({
		before: z.number().int().nonnegative(),
		after: z.number().int().positive(),
	})
	.loose();

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
	// A plan that creates the customer starts its log.
	const planCreatesCustomer =
		mutation.command.type === "applyBillingPlan" &&
		changesInsertCustomer({ changes: mutation.changes });
	if (planCreatesCustomer && mutation.revision.before !== 0) {
		context.addIssue({
			code: "custom",
			message: "A plan that creates the customer must start at revision zero",
			path: ["revision", "before"],
		});
	}
	// Nothing moves on an evict: the store lands its bookmark alone and replay has nothing to apply.
	if (mutation.command.type === "evict" && mutation.changes.length > 0) {
		context.addIssue({
			code: "custom",
			message: "An evict carries no row changes",
			path: ["changes"],
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
export const subjectStateMutationSchema = z.preprocess(
	skipUnknownRowChanges,
	z
		.object(subjectStateMutationShape)
		.loose()
		.superRefine(refineSubjectStateMutation),
);

export type MutationCommand = MutatingCommand;
export type MutationResult = z.infer<typeof mutationResultSchema>;
export type SubjectStateMutation = z.infer<typeof subjectStateMutationSchema>;
