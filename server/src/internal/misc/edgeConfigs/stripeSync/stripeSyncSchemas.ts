import { z } from "zod/v4";

export const StripeSyncConfigSchema = z.object({
	enabledOrgIds: z.array(z.string()).default([]),
});

export type StripeSyncConfig = z.infer<typeof StripeSyncConfigSchema>;
