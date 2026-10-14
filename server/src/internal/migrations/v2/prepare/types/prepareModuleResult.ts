import { z } from "zod/v4";

export const PrepareModuleResultSchema = z.object({
	key: z.string(),
	kind: z.string(),
	result: z.unknown(),
});

export type PrepareModuleResult = z.infer<typeof PrepareModuleResultSchema>;
