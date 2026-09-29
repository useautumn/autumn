import { z } from "zod/v4";

export const evictResultSchema = z.object({ type: z.literal("evict") }).loose();

export type EvictResult = z.infer<typeof evictResultSchema>;
