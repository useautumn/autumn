import { z } from "zod/v4";
import type {
	AlienDeployment,
	AlienResourceState,
} from "../types/alienClient.js";

const AlienErrorSchema = z.object({ message: z.string() });

const ResourceSchema = z.object({
	config: z.object({ type: z.string() }).nullish(),
	status: z.string().nullish(),
	outputs: z.record(z.string(), z.unknown()).nullish(),
	error: z.unknown().optional(),
});

const StackStateSchema = z.object({
	resources: z.record(z.string(), ResourceSchema),
});

/** alien's own words for an error, when it gave any. */
const toErrorMessage = (error: unknown): string | null => {
	const parsed = AlienErrorSchema.safeParse(error);
	return parsed.success ? parsed.data.message : null;
};

/** Every resource in the deployment's stack; none until alien has started on it. */
export const deploymentToResources = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): AlienResourceState[] => {
	const stackState = StackStateSchema.safeParse(deployment.stackState);
	if (!stackState.success) return [];
	return Object.entries(stackState.data.resources).map(([id, resource]) => ({
		id,
		type: resource.config?.type ?? null,
		status: resource.status ?? null,
		outputs: resource.outputs ?? null,
		error: toErrorMessage(resource.error),
	}));
};

/** Why the deployment stopped: its own error, else the first of its resources'. */
export const deploymentToErrorMessage = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): string | null =>
	toErrorMessage(deployment.error) ??
	deploymentToResources({ deployment }).find((resource) => resource.error)
		?.error ??
	null;
