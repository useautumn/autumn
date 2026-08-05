import { z } from "zod/v4";

export const AsyncTrackConfigSchema = z.object({
	enabledOrgIds: z.array(z.string()).default([]),
});

export type AsyncTrackConfig = z.infer<typeof AsyncTrackConfigSchema>;
