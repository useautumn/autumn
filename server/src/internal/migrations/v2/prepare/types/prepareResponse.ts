import { z } from "zod/v4";
import { PrepareModuleResultSchema } from "./prepareModuleResult.js";

/**
 * Envelope for `POST /migrations.prepare`.
 *
 * `modules` carries the orchestrator-level (loose) per-module results.
 * Strict per-module typed schemas live in `modules/<kind>/types.ts`.
 */
export const PrepareResponseSchema = z.object({
	migration_id: z.string(),
	dry_run: z.boolean(),
	modules: z.array(PrepareModuleResultSchema),
	warnings: z.array(z.string()),
});

export type PrepareResponse = z.infer<typeof PrepareResponseSchema>;
