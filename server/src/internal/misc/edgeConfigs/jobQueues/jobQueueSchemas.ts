import { z } from "zod/v4";

export const JobQueueConfigSchema = z.object({
	queues: z
		.record(
			z.string(),
			z.object({
				enabled: z.boolean().default(false),
			}),
		)
		.default({}),
});

export type JobQueueConfig = z.infer<typeof JobQueueConfigSchema>;
