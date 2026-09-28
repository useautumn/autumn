import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";
import type { AutumnLogger } from "@autumn/logging";
import type { TaskIdentity } from "./types/taskIdentity.js";

type TaskMetadata = { ServiceName?: string; Cluster?: string };
type MetadataFetch = (
	url: string,
	init: { signal: AbortSignal },
) => Promise<Response>;

const METADATA_ATTEMPTS = 5;
const METADATA_FIRST_BACKOFF_MS = 500;
const METADATA_TIMEOUT_MS = 2_000;

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

/** Throws on a transport failure or a non-2xx, which are retried; a body without a cluster is final. */
async function fetchTaskMetadata({
	ctx,
	metadataUri,
}: {
	ctx: { fetch: MetadataFetch };
	metadataUri: string;
}): Promise<TaskMetadata> {
	const response = await ctx.fetch(`${metadataUri}/task`, {
		signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
	});
	if (!response.ok)
		throw new Error(`ECS task metadata returned ${response.status}`);
	return (await response.json()) as TaskMetadata;
}

/**
 * Reads the ECS task metadata once at boot, retrying a slow or absent endpoint for ~10s.
 * Still fails open after that (a null service ARN), but says so at error level: a green
 * task without its identity would otherwise take blue's partitions.
 */
export async function resolveTaskIdentity({
	ctx,
	env,
}: {
	ctx: {
		logger?: Pick<AutumnLogger, "warn" | "error">;
		fetch?: MetadataFetch;
		sleep?: (ms: number) => Promise<void>;
	};
	env: Pick<
		Partial<BalanceWorkerEnv>,
		"ECS_CONTAINER_METADATA_URI_V4" | "FC_GIT_COMMIT_SHA" | "IMAGE_TAG"
	>;
}): Promise<TaskIdentity> {
	const imageSha = env.FC_GIT_COMMIT_SHA ?? env.IMAGE_TAG ?? null;
	const metadataUri = env.ECS_CONTAINER_METADATA_URI_V4;
	if (!metadataUri) return { serviceArn: null, imageSha };
	const sleep = ctx.sleep ?? Bun.sleep;
	let backoffMs = METADATA_FIRST_BACKOFF_MS;
	for (let attempt = 1; attempt <= METADATA_ATTEMPTS; attempt++) {
		try {
			const metadata = await fetchTaskMetadata({
				ctx: { fetch: ctx.fetch ?? fetch },
				metadataUri,
			});
			const serviceArn =
				typeof metadata.ServiceName === "string" &&
				typeof metadata.Cluster === "string"
					? serviceArnOf({
							clusterArn: metadata.Cluster,
							serviceName: metadata.ServiceName,
						})
					: null;
			if (!serviceArn)
				ctx.logger?.error(
					`ECS task metadata names no service (${JSON.stringify(metadata)}); blue-green gate fails open`,
				);
			return { serviceArn, imageSha };
		} catch (cause) {
			const reason = cause instanceof Error ? cause.message : String(cause);
			if (attempt === METADATA_ATTEMPTS) {
				ctx.logger?.error(
					`ECS task metadata unavailable after ${attempt} attempts (${reason}); blue-green gate fails open`,
				);
				return { serviceArn: null, imageSha };
			}
			ctx.logger?.warn(
				`ECS task metadata attempt ${attempt} failed (${reason}); retrying in ${backoffMs}ms`,
			);
			await sleep(backoffMs);
			backoffMs *= 2;
		}
	}
	return { serviceArn: null, imageSha };
}
