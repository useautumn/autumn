import { z } from "zod/v4";

/** Loose: a future worker may add fields; an older one replaying the log ignores them. */
export const initializeResultSchema = z
	.object({ type: z.literal("initialize") })
	.loose();

export type InitializeResult = z.infer<typeof initializeResultSchema>;
