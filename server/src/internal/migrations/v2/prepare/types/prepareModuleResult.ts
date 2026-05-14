import { z } from "zod/v4";

/**
 * Orchestrator-level envelope for one prepare module's result. `result`
 * is intentionally loose (`z.unknown()`) — strict per-module schemas
 * live in `modules/<kind>/types.ts` and refine `result` to their typed
 * payload.
 */
export const PrepareModuleResultSchema = z.object({
	key: z.string(),
	kind: z.string(),
	result: z.unknown(),
});

export type PrepareModuleResult = z.infer<typeof PrepareModuleResultSchema>;
