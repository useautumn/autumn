import { z } from "zod/v4";

export const AlienDeploymentSchema = z.object({
	id: z.string(),
	status: z.string(),
});

export const AlienDeploymentListSchema = z.object({
	items: z.array(AlienDeploymentSchema),
});
