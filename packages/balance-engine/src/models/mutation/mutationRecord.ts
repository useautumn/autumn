import { z } from "zod/v4";
import { nonEmptyStringSchema, timestampSchema } from "../common/primitives.js";
import { mutationEffectSchema } from "./mutationEffect.js";
import { skipUnknownRowChanges } from "./rowChange.js";
import {
	refineSubjectStateMutation,
	subjectStateMutationShape,
} from "./subjectStateMutation.js";

const mutationReceiptSchema = z
	.object({ fingerprint: nonEmptyStringSchema, expiresAt: timestampSchema })
	.loose();

const mutationSourceSchema = z
	.object({ commandOffset: z.string().regex(/^\d+$/) })
	.loose();

export const mutationRecordSchema = z.preprocess(
	skipUnknownRowChanges,
	z
		.object({
			...subjectStateMutationShape,
			receipt: mutationReceiptSchema,
			source: mutationSourceSchema.optional(),
			effects: z.array(mutationEffectSchema).optional(),
		})
		.loose()
		.superRefine(refineSubjectStateMutation),
);

export type MutationReceipt = z.infer<typeof mutationReceiptSchema>;
export type MutationSource = z.infer<typeof mutationSourceSchema>;
export type MutationRecord = z.infer<typeof mutationRecordSchema>;
