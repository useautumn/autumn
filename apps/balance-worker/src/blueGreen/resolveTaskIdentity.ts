import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { AutumnLogger } from "@autumn/logging";
import type { TaskIdentity } from "./types/taskIdentity.js";

type TaskMetadata = { ServiceName?: string; Cluster?: string };

/** arn:aws:ecs:<region>:<account>:cluster/<cluster> + a service name → the service ARN. */
function serviceArnOf({
	clusterArn,
	serviceName,
}: {
	clusterArn: string;
	serviceName: string;
}): string | null {
	const match = clusterArn.match(/^arn:aws:ecs:([^:]+):([^:]+):cluster\/(.+)$/);
	if (!match) return null;
	const [, region, accountId, clusterName] = match;
	return `arn:aws:ecs:${region}:${accountId}:service/${clusterName}/${serviceName}`;
}

/** Reads the ECS task metadata once at boot; any failure resolves to no service and the gate fails open. */
export async function resolveTaskIdentity({
	ctx,
	env,
}: {
	ctx: { logger?: Pick<AutumnLogger, "warn"> };
	env: Pick<
		BalanceWorkerEnv,
		"ECS_CONTAINER_METADATA_URI_V4" | "FC_GIT_COMMIT_SHA" | "IMAGE_TAG"
	>;
}): Promise<TaskIdentity> {
	const imageSha = env.FC_GIT_COMMIT_SHA ?? env.IMAGE_TAG ?? null;
	const metadataUri = env.ECS_CONTAINER_METADATA_URI_V4;
	if (!metadataUri) return { serviceArn: null, imageSha };
	try {
		const response = await fetch(`${metadataUri}/task`, {
			signal: AbortSignal.timeout(2_000),
		});
		if (!response.ok) {
			ctx.logger?.warn(
				`ECS task metadata returned ${response.status}; blue-green gate fails open`,
			);
			return { serviceArn: null, imageSha };
		}
		const metadata: TaskMetadata = await response.json();
		if (
			typeof metadata.ServiceName !== "string" ||
			typeof metadata.Cluster !== "string"
		)
			return { serviceArn: null, imageSha };
		const serviceArn = serviceArnOf({
			clusterArn: metadata.Cluster,
			serviceName: metadata.ServiceName,
		});
		if (!serviceArn)
			ctx.logger?.warn(
				`Could not parse ECS cluster ARN ${metadata.Cluster}; blue-green gate fails open`,
			);
		return { serviceArn, imageSha };
	} catch (cause) {
		ctx.logger?.warn(
			`ECS task metadata fetch failed: ${cause instanceof Error ? cause.message : cause}; blue-green gate fails open`,
		);
		return { serviceArn: null, imageSha };
	}
}
