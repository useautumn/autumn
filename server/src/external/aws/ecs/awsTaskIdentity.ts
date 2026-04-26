import { z } from "zod/v4";

/**
 * Identity of the ECS task this Node process is running in. Applies to
 * server, workers, and cron — used by the blue-green gate (matching on
 * `serviceArn`) and by log/trace tagging.
 *
 * - `serviceArn`: full ECS service ARN constructed at boot from the v4
 *   metadata `Cluster` ARN + `ServiceName`. Stable across deploys, unique
 *   per FC blue/green service. **Sole gate signal.**
 * - `imageSha`: from `FC_GIT_COMMIT_SHA` / `IMAGE_TAG` env. Used only for
 *   log/trace tagging (which deploy code is running) — NOT a gate signal,
 *   to avoid the stale-SHA failure mode.
 *
 * Both may be null on non-ECS hosts (Railway, local). The gate fails open
 * when `serviceArn` is null (`hasAwsTaskIdentity()` returns false).
 */
export const AwsTaskIdentitySchema = z.object({
	serviceArn: z.string().nullable(),
	imageSha: z.string().nullable(),
});
export type AwsTaskIdentity = z.infer<typeof AwsTaskIdentitySchema>;

let cachedIdentity: AwsTaskIdentity | null = null;
let identityResolved = false;
let identityPromise: Promise<AwsTaskIdentity> | null = null;

/**
 * Build the full ECS service ARN from the v4 `Cluster` ARN + a service
 * name. Returns null if the cluster ARN doesn't match the expected format.
 *
 * - Cluster ARN: arn:aws:ecs:<region>:<accountId>:cluster/<clusterName>
 * - Service ARN: arn:aws:ecs:<region>:<accountId>:service/<clusterName>/<serviceName>
 */
const constructServiceArn = ({
	clusterArn,
	serviceName,
}: {
	clusterArn: string;
	serviceName: string;
}): string | null => {
	const match = clusterArn.match(/^arn:aws:ecs:([^:]+):([^:]+):cluster\/(.+)$/);
	if (!match) return null;
	const [, region, accountId, clusterName] = match;
	return `arn:aws:ecs:${region}:${accountId}:service/${clusterName}/${serviceName}`;
};

/**
 * Reads the ECS task metadata endpoint to resolve this task's identity.
 * Cached for process lifetime — neither field changes for a running task.
 */
export const resolveAwsTaskIdentity = async (): Promise<AwsTaskIdentity> => {
	if (identityResolved && cachedIdentity) return cachedIdentity;
	if (identityPromise) return identityPromise;

	identityPromise = (async (): Promise<AwsTaskIdentity> => {
		const imageSha =
			process.env.FC_GIT_COMMIT_SHA || process.env.IMAGE_TAG || null;

		const metadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
		let serviceArn: string | null = null;

		if (metadataUri) {
			try {
				const response = await fetch(`${metadataUri}/task`, {
					signal: AbortSignal.timeout(2_000),
				});
				if (response.ok) {
					const body = (await response.json()) as {
						ServiceName?: string;
						Cluster?: string;
					};
					if (
						typeof body.ServiceName === "string" &&
						typeof body.Cluster === "string"
					) {
						serviceArn = constructServiceArn({
							clusterArn: body.Cluster,
							serviceName: body.ServiceName,
						});
						if (!serviceArn) {
							console.warn(
								`[awsTaskIdentity] Could not parse cluster ARN: ${body.Cluster}; gate will fail open`,
							);
						}
					}
				} else {
					console.warn(
						`[awsTaskIdentity] ECS metadata returned ${response.status}; gate will fail open`,
					);
				}
			} catch (error) {
				console.warn(
					`[awsTaskIdentity] ECS metadata fetch failed: ${error instanceof Error ? error.message : error}; gate will fail open`,
				);
			}
		} else if (process.env.NODE_ENV === "production") {
			console.warn(
				"[awsTaskIdentity] ECS_CONTAINER_METADATA_URI_V4 unset in production — gate will fail open",
			);
		}

		cachedIdentity = { serviceArn, imageSha };
		identityResolved = true;
		return cachedIdentity;
	})();

	return identityPromise;
};

/** Synchronous reader. Returns null until `resolveAwsTaskIdentity` resolves. */
export const getAwsTaskIdentity = (): AwsTaskIdentity | null => cachedIdentity;

/**
 * True iff `serviceArn` is known. The gate uses this — when false, we're
 * either on a non-ECS host (Railway, local) or ECS metadata didn't surface
 * the data we need (rare). Either way → fail open.
 */
export const hasAwsTaskIdentity = (): boolean =>
	Boolean(cachedIdentity?.serviceArn);

// Fire-and-forget at module load so server, workers, and cron all get
// identity resolved without each entry point having to await explicitly.
void resolveAwsTaskIdentity();
