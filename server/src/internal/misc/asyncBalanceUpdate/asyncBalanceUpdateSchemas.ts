import { z } from "zod/v4";

export const AsyncBalanceUpdateConfigSchema = z.object({
	enabledOrgIds: z.array(z.string()).default([]),
});

export type AsyncBalanceUpdateConfig = z.infer<
	typeof AsyncBalanceUpdateConfigSchema
>;
