import { z } from "zod/v4";
import { nonEmptyStringSchema, timestampSchema } from "../common/primitives.js";
import { mutationEffectSchema } from "./mutationEffect.js";
import { mutationSummarySchema } from "./mutationSummary.js";
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

/** What the log, the store and a checkpoint hold: the engine's mutation plus the writer's receipt. */
const mutationRecordObjectSchema = z
	.object({
		...subjectStateMutationShape,
		receipt: mutationReceiptSchema,
		/** Consumed commands only: the committer moves the command bookmark past it with the rows. */
		source: mutationSourceSchema.optional(),
		/** What must happen elsewhere because of this mutation. On the log only, for its readers: never replayed, and dropped before the record is stored or checkpointed. */
		effects: z.array(mutationEffectSchema).optional(),
		summary: mutationSummarySchema.optional(),
	})
	.strict();

export const mutationRecordSchema =
	mutationRecordObjectSchema.superRefine(refineMutationRecord);

type MutationRecordShape = z.infer<typeof mutationRecordObjectSchema>;

function refineMutationRecord(
	record: MutationRecordShape,
	context: z.RefinementCtx,
): void {
	refineSubjectStateMutation(record, context);
	if (record.command.type === "evict" && record.summary) {
		context.addIssue({
			code: "custom",
			message: "An evict carries no summary",
			path: ["summary"],
		});
	}
	if (record.command.type !== "track") return;
	for (const [index, view] of (record.summary ?? []).entries()) {
		if (!view.rows) continue;
		context.addIssue({
			code: "custom",
			message: "A track's summary carries totals only",
			path: ["summary", index, "rows"],
		});
	}
}

export type MutationReceipt = z.infer<typeof mutationReceiptSchema>;
export type MutationSource = z.infer<typeof mutationSourceSchema>;
export type MutationRecord = z.infer<typeof mutationRecordSchema>;
