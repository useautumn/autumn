import { z } from "zod/v4";

export const PreviewScalarValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.null(),
]);

export const PreviewScalarChangeSchema = z.object({
	before: PreviewScalarValueSchema,
	after: PreviewScalarValueSchema,
});

export type PreviewScalarValue = z.infer<typeof PreviewScalarValueSchema>;
export type PreviewScalarChange = z.infer<typeof PreviewScalarChangeSchema>;
