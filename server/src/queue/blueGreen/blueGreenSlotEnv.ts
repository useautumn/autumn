import { randomUUID } from "node:crypto";
import type { WorkerIdentity } from "./blueGreenSchemas.js";

let cachedInstanceId: string | null = null;

/** Stable per-process id. pid + short uuid keeps it human-skimmable in S3 listings. */
export const getInstanceId = (): string => {
	if (cachedInstanceId) return cachedInstanceId;
	const shortId = randomUUID().split("-")[0];
	cachedInstanceId = `${process.pid}-${shortId}`;
	return cachedInstanceId;
};

let cachedIdentity: WorkerIdentity | null = null;
let identityResolved = false;

/**
 * Reads the ECS task metadata endpoint to derive a stable identity for this
 * task set. Falls back to FC_GIT_COMMIT_SHA when metadata is unavailable
 * (local dev, non-ECS runtimes).
 *
 * Cached for process lifetime — task def ARN never changes for a running task.
 */
export const resolveWorkerIdentity = async (): Promise<WorkerIdentity> => {
	if (identityResolved && cachedIdentity) return cachedIdentity;

	const imageSha =
		process.env.FC_GIT_COMMIT_SHA || process.env.IMAGE_TAG || null;

	const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
	let taskDefinitionArn: string | null = null;

	if (metadataUri) {
		try {
			const response = await fetch(`${metadataUri}/task`, {
				signal: AbortSignal.timeout(2_000),
			});
			if (response.ok) {
				const body = (await response.json()) as {
					TaskDefinitionArn?: string;
					TaskARN?: string;
				};
				if (typeof body.TaskDefinitionArn === "string") {
					taskDefinitionArn = body.TaskDefinitionArn;
				}
			}
		} catch {
			// Metadata endpoint unavailable or timed out — fall through to SHA-only identity.
		}
	}

	cachedIdentity = { taskDefinitionArn, imageSha };
	identityResolved = true;
	return cachedIdentity;
};

/** Synchronous reader. Returns null if identity hasn't been resolved yet. */
export const getResolvedWorkerIdentity = (): WorkerIdentity | null =>
	cachedIdentity;

/** True when running in a context where blue-green gating should apply. */
export const hasWorkerIdentity = (): boolean => {
	if (!cachedIdentity) return false;
	return Boolean(cachedIdentity.taskDefinitionArn || cachedIdentity.imageSha);
};
