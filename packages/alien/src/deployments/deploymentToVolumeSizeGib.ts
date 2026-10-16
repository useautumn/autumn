import { z } from "zod/v4";
import type { AlienDeployment } from "../types/alienClient.js";

const StackSettingsSchema = z.object({
	compute: z.object({
		containers: z.record(
			z.string(),
			z.object({ volumeSizeGib: z.number().nullish() }),
		),
	}),
});

/** The per-replica volume size a container's deployment selects; null when it selects none and runs the release default. */
export const deploymentToVolumeSizeGib = ({
	deployment,
	resourceId,
}: {
	deployment: AlienDeployment;
	resourceId: string;
}): number | null => {
	const stackSettings = StackSettingsSchema.safeParse(deployment.stackSettings);
	if (!stackSettings.success) return null;
	return (
		stackSettings.data.compute.containers[resourceId]?.volumeSizeGib ?? null
	);
};
