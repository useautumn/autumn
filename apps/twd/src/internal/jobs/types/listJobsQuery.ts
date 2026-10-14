import { z } from "zod";

export const ListJobsQuery = z.object({
	status: z.enum(["live", "finished", "all"]).default("all"),
	kind: z
		.enum(["warm", "swarm", "nuke", "reinit_keys", "full_nuke_key", "qa"])
		.optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type ListJobsQuery = z.infer<typeof ListJobsQuery>;
