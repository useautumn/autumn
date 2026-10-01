import { z } from "zod/v4";
import type { AlienDeployment } from "../types/alienClient.js";

const StackStateSchema = z.object({
	resources: z.record(
		z.string(),
		z.object({
			outputs: z
				.object({
					publicEndpoints: z
						.record(z.string(), z.object({ url: z.string() }))
						.optional(),
				})
				.nullish(),
		}),
	),
});

/** Where a resource's public endpoint answers; null until alien has brought it up. */
export const deploymentToPublicEndpointUrl = ({
	deployment,
	resourceId,
	endpointName,
}: {
	deployment: AlienDeployment;
	resourceId: string;
	endpointName: string;
}): string | null => {
	const stackState = StackStateSchema.safeParse(deployment.stackState);
	if (!stackState.success) return null;
	const { outputs } = stackState.data.resources[resourceId] ?? {};
	const endpoints = Object.values(outputs?.publicEndpoints ?? {});
	// The hosted manager keys a container's one endpoint `default`; the local manager keys it by name.
	const endpoint =
		outputs?.publicEndpoints?.[endpointName] ??
		(endpoints.length === 1 ? endpoints[0] : undefined);
	return endpoint?.url ?? null;
};
