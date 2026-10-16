import { z } from "zod/v4";
import type { AlienDeployment } from "../types/alienClient.js";

const UpdateOperationSchema = z.object({
	id: z.string(),
	status: z.enum([
		"blocked",
		"queued",
		"applying",
		"succeeded",
		"failed",
		"superseded",
	]),
	requestedAt: z.string(),
	completedAt: z.string().nullish(),
	actionRequired: z.string().nullish(),
});

const UpdateStateSchema = z.object({
	active: UpdateOperationSchema.nullish(),
	latest: UpdateOperationSchema.nullish(),
});

export type AlienUpdateOperation = z.infer<typeof UpdateOperationSchema>;

/** The update alien is applying, else the last one it finished; null when it reports none. */
export const deploymentToUpdate = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): AlienUpdateOperation | null => {
	const updateState = UpdateStateSchema.safeParse(deployment.updateState);
	if (!updateState.success) return null;
	return updateState.data.active ?? updateState.data.latest ?? null;
};
