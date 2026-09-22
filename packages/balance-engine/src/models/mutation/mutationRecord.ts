import { z } from "zod/v4";
import { catalogSchema } from "../catalog/catalog.js";
import { nonEmptyStringSchema, timestampSchema } from "../common/primitives.js";
import { subjectStateSchema } from "../subject/subjectState.js";
import {
	refineSubjectStateMutation,
	subjectStateMutationShape,
} from "./subjectStateMutation.js";

/** The writer's dedup stamp: what a retry of the same command id must match, and how long that is remembered. */
const mutationReceiptSchema = z
	.object({ fingerprint: nonEmptyStringSchema, expiresAt: timestampSchema })
	.strict();

/** Where a queued command sat on the command topic; absent for a command sent over HTTP. */
const mutationSourceSchema = z
	.object({ commandOffset: z.string().regex(/^\d+$/) })
	.strict();

/** The subject as the mutation left it, with the catalog it was decided against: undoing `changes` on it gives the subject as found. */
const mutationAfterSchema = z
	.object({ state: subjectStateSchema, catalog: catalogSchema })
	.strict();

/** What the log, the store and a checkpoint hold: the engine's mutation plus the writer's receipt. */
export const mutationRecordSchema = z
	.object({
		...subjectStateMutationShape,
		receipt: mutationReceiptSchema,
		/** Consumed commands only: the committer moves the command bookmark past it with the rows. */
		source: mutationSourceSchema.optional(),
		/** On the log only, for its readers: never replayed, and dropped before the record is stored or checkpointed. */
		after: mutationAfterSchema.optional(),
	})
	.strict()
	.superRefine(refineSubjectStateMutation);

export type MutationAfter = z.infer<typeof mutationAfterSchema>;
export type MutationReceipt = z.infer<typeof mutationReceiptSchema>;
export type MutationSource = z.infer<typeof mutationSourceSchema>;
export type MutationRecord = z.infer<typeof mutationRecordSchema>;
