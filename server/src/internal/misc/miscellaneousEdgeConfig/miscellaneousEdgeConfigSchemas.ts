import { z } from "zod/v4";

export const MiscellaneousEdgeConfigSchema = z.object({
	newFlatCusModel: z.array(z.string()).default([]),
	syncCoalesce: z.boolean().default(false),
	subjectLookupDbOnly: z.boolean().default(false),
	idempotencyDynamoRead: z.boolean().default(false),
	redisFallbackToDb: z.boolean().default(false),
	subjectReadSingleflight: z.boolean().default(true),
	disableMotherduckCacheRefresh: z.boolean().default(false),
	axiomResponseBodyReduction: z.boolean().default(true),
	expiredGrantCleanup: z.boolean().default(false),
});

export type MiscellaneousEdgeConfig = z.infer<
	typeof MiscellaneousEdgeConfigSchema
>;
