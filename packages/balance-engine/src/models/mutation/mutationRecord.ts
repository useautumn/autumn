import { z } from "zod/v4";
import { nonEmptyStringSchema, timestampSchema } from "../common/primitives.js";
import {
	refineSubjectStateMutation,
	subjectStateMutationShape,
} from "./subjectStateMutation.js";

/** The writer's dedup stamp: what a retry of the same command id must match, and how long that is remembered. */
const mutationReceiptSchema = z
	.object({ fingerprint: nonEmptyStringSchema, expiresAt: timestampSchema })
	.strict();

/** What the log, the store and a checkpoint hold: the engine's mutation plus the writer's receipt. */
export const mutationRecordSchema = z
	.object({ ...subjectStateMutationShape, receipt: mutationReceiptSchema })
	.strict()
	.superRefine(refineSubjectStateMutation);

export type MutationReceipt = z.infer<typeof mutationReceiptSchema>;
export type MutationRecord = z.infer<typeof mutationRecordSchema>;
