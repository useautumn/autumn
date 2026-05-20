import { z } from "zod/v4";

export const MiscellaneousEdgeConfigSchema = z.object({
	newFlatCusModel: z.array(z.string()).default([]),
});

export type MiscellaneousEdgeConfig = z.infer<
	typeof MiscellaneousEdgeConfigSchema
>;
