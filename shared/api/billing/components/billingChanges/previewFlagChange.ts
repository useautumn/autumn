import { z } from "zod/v4";

export const PreviewFlagChangeSchema = z.object({
	action: z.enum(["created", "deleted"]),
	feature_id: z.string(),
});

export type PreviewFlagChange = z.infer<typeof PreviewFlagChangeSchema>;
