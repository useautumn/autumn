import { z } from "zod/v4";

export const AlienDeploymentSchema = z.object({
	id: z.string(),
	status: z.string(),
	region: z.string().nullish(),
	error: z.unknown().optional(),
	stackState: z.unknown().optional(),
	stackSettings: z.unknown().optional(),
});

export const AlienDeploymentListSchema = z.object({
	items: z.array(AlienDeploymentSchema),
});
