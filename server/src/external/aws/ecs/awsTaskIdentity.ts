import { z } from "zod/v4";

/**
 * Identity of the ECS task this Node process is running in. Applies to
 * server, workers, and cron — used both by the blue-green gate and by
 * log/trace tagging so Axiom can distinguish between task sets.
 *
 * `taskDefinitionArn` comes from the ECS Container Metadata Endpoint v4.
 * `imageSha` falls back to `FC_GIT_COMMIT_SHA`. Either may be null on
 * non-ECS hosts (Railway, local dev) — callers must treat that as
 * "blue-green disabled" and fail open.
 */
export const AwsTaskIdentitySchema = z.object({
	taskDefinitionArn: z.string().nullable(),
	imageSha: z.string().nullable(),
});
export type AwsTaskIdentity = z.infer<typeof AwsTaskIdentitySchema>;

let cachedIdentity: AwsTaskIdentity | null = null;
let identityResolved = false;

/**
 * Reads the ECS task metadata endpoint to resolve this task's identity.
 * Falls back to `FC_GIT_COMMIT_SHA` / `IMAGE_TAG` when metadata is
 * unavailable. Cached for process lifetime — neither value changes for
 * a running task.
 */
export const resolveAwsTaskIdentity = async (): Promise<AwsTaskIdentity> => {
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

/** Synchronous reader. Returns null until `resolveAwsTaskIdentity` resolves. */
export const getAwsTaskIdentity = (): AwsTaskIdentity | null => cachedIdentity;

/**
 * True when this process is running in a context where the AWS task
 * identity is known. False on non-ECS hosts (Railway, local) where the
 * gate must fall open.
 */
export const hasAwsTaskIdentity = (): boolean => {
	if (!cachedIdentity) return false;
	return Boolean(cachedIdentity.taskDefinitionArn || cachedIdentity.imageSha);
};

// Fire-and-forget at module load so server, workers, and cron all get
// identity resolved without each entry point having to await explicitly.
// Logs/spans emitted before resolution finishes (~100ms) lack `aws.*`.
void resolveAwsTaskIdentity();
