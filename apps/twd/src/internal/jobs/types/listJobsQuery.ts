import { z } from "zod";

/** GET /jobs query. Not in api/contract.ts; the integrator may promote it there. */
export const ListJobsQuery = z.object({
	status: z.enum(["live", "finished", "all"]).default("all"),
	kind: z.enum(["warm", "swarm", "nuke", "reinit_keys", "full_nuke_key"]).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListJobsQuery = z.infer<typeof ListJobsQuery>;
