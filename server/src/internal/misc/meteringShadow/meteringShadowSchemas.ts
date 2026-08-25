import { z } from "zod/v4";

export const MeteringShadowConfigSchema = z.object({
	enabled: z.boolean().default(false),
	/** Empty means every org is mirrored; `"*"` does the same explicitly. */
	orgs: z.array(z.string()).default([]),
});

export type MeteringShadowConfig = z.infer<typeof MeteringShadowConfigSchema>;
