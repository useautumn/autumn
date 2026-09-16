import { z } from "zod/v4";

export const initializeResultSchema = z
	.object({ type: z.literal("initialize") })
	.strict();

export type InitializeResult = z.infer<typeof initializeResultSchema>;
