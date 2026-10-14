import { z } from "zod/v4";
import type { AlienDeployment } from "../types/alienClient.js";

const StackSettingsSchema = z.object({
	compute: z.object({
		pools: z.record(z.string(), z.object({ machine: z.string() })),
	}),
});

export const deploymentToPoolMachine = ({
	deployment,
	pool,
}: {
	deployment: AlienDeployment;
	pool: string;
}): string | null => {
	const stackSettings = StackSettingsSchema.safeParse(deployment.stackSettings);
	if (!stackSettings.success) return null;
	return stackSettings.data.compute.pools[pool]?.machine ?? null;
};
