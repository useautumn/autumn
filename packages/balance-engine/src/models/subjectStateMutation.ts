import { z } from "zod/v4";
import { initializeCommandEchoSchema } from "../commands/initialize/types/initializeCommand.js";
import { initializeResultSchema } from "../commands/initialize/types/initializeResult.js";
import { trackCommandEchoSchema } from "../commands/track/types/trackCommand.js";
import { trackResultSchema } from "../commands/track/types/trackResult.js";
import { mutationFingerprintOf } from "../mutation/mutationFingerprintOf.js";
import { nonEmptyStringSchema, timestampSchema } from "./common/primitives.js";
import { meteringIdentitySchema } from "./meteringIdentity.js";
import { rowChangeSchema } from "./rowChange.js";

// One record type on the log: every command contributes its echo and result here.
export const mutationCommandSchema = z.discriminatedUnion("type", [
	trackCommandEchoSchema,
	initializeCommandEchoSchema,
]);

export const mutationResultSchema = z.discriminatedUnion("type", [
	trackResultSchema,
	initializeResultSchema,
]);

const mutationRevisionSchema = z
	.object({
		before: z.number().int().nonnegative(),
		after: z.number().int().positive(),
	})
	.strict();

const mutationReceiptSchema = z
	.object({ fingerprint: nonEmptyStringSchema, expiresAt: timestampSchema })
	.strict();

export const subjectStateMutationSchema = z
	.object({
		schemaVersion: z.literal(1),
		type: z.literal("mutation"),
		id: nonEmptyStringSchema,
		identity: meteringIdentitySchema,
		revision: mutationRevisionSchema,
		command: mutationCommandSchema,
		changes: z.array(rowChangeSchema),
		result: mutationResultSchema,
		receipt: mutationReceiptSchema,
	})
	.strict()
	.superRefine((mutation, context) => {
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
				path: ["result", "kind"],
			});
		}
		if (mutation.command.type === "initialize") {
			if (mutation.revision.before !== 0) {
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
		if (mutation.receipt.fingerprint !== mutationFingerprintOf({ mutation })) {
			context.addIssue({
				code: "custom",
				message: "receipt.fingerprint must match the mutation inputs",
				path: ["receipt", "fingerprint"],
			});
		}
	});

export type MutationCommand = z.infer<typeof mutationCommandSchema>;
export type MutationResult = z.infer<typeof mutationResultSchema>;
export type SubjectStateMutation = z.infer<typeof subjectStateMutationSchema>;
