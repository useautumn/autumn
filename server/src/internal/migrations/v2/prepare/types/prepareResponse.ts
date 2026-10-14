import { z } from "zod/v4";
import { PrepareModuleResultSchema } from "./prepareModuleResult.js";

export const PrepareResponseSchema = z.object({
	migration_id: z.string(),
	dry_run: z.boolean(),
	modules: z.array(PrepareModuleResultSchema),
	warnings: z.array(z.string()),
});

export type PrepareResponse = z.infer<typeof PrepareResponseSchema>;
