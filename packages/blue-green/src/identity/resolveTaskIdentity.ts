import type { AutumnLogger } from "@autumn/logging";
import type { TaskIdentity } from "../types/taskIdentity.js";

type TaskMetadata = { ServiceName?: string; Cluster?: string };
type MetadataFetch = (
	url: string,
	init: { signal: AbortSignal },
) => Promise<Response>;

/** The env a process reads its identity from; each app's env object carries these verbatim. */
export type TaskIdentityEnv = {
	ECS_CONTAINER_METADATA_URI_V4?: string;
	FC_GIT_COMMIT_SHA?: string;
	IMAGE_TAG?: string;
};

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
 * Reads the ECS task metadata once at boot, retrying a slow or absent endpoint for ~10s,
 * then refuses to start: the service ARN names this task's fleet, and a task without it
 * would run with an open gate beside its healthy peers. Off ECS (no metadata URI) there
 * is no fleet, and the gate fails open.
 */
export async function resolveTaskIdentity({
	ctx,
	env,
}: {
	ctx: {
		logger?: Pick<AutumnLogger, "warn">;
		fetch?: MetadataFetch;
		sleep?: (ms: number) => Promise<void>;
	};
	env: TaskIdentityEnv;
}): Promise<TaskIdentity> {
	const imageSha = env.FC_GIT_COMMIT_SHA ?? env.IMAGE_TAG ?? null;
	const metadataUri = env.ECS_CONTAINER_METADATA_URI_V4;
	if (!metadataUri) return { serviceArn: null, imageSha };
	const sleep = ctx.sleep ?? Bun.sleep;
	let backoffMs = METADATA_FIRST_BACKOFF_MS;
	let metadata: TaskMetadata | undefined;
	let reason = "";
	for (let attempt = 1; attempt <= METADATA_ATTEMPTS && !metadata; attempt++) {
		try {
			metadata = await fetchTaskMetadata({
				ctx: { fetch: ctx.fetch ?? fetch },
				metadataUri,
			});
		} catch (cause) {
			reason = cause instanceof Error ? cause.message : String(cause);
			if (attempt === METADATA_ATTEMPTS) break;
			ctx.logger?.warn(
				`ECS task metadata attempt ${attempt} failed (${reason}); retrying in ${backoffMs}ms`,
			);
			await sleep(backoffMs);
			backoffMs *= 2;
		}
	}
	if (!metadata)
		throw new Error(
			`ECS task metadata unavailable after ${METADATA_ATTEMPTS} attempts (${reason}); refusing to start without a fleet identity`,
		);
	const serviceArn =
		typeof metadata.ServiceName === "string" &&
		typeof metadata.Cluster === "string"
			? serviceArnOf({
					clusterArn: metadata.Cluster,
					serviceName: metadata.ServiceName,
				})
			: null;
	if (!serviceArn)
		throw new Error(
			`ECS task metadata names no service (${JSON.stringify(metadata)}); refusing to start without a fleet identity`,
		);
	return { serviceArn, imageSha };
}
