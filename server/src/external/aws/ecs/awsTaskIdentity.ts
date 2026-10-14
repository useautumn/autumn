import { z } from "zod/v4";

export const AwsTaskIdentitySchema = z.object({
	serviceArn: z.string().nullable(),
	imageSha: z.string().nullable(),
});
export type AwsTaskIdentity = z.infer<typeof AwsTaskIdentitySchema>;

let cachedIdentity: AwsTaskIdentity | null = null;
let identityResolved = false;
let identityPromise: Promise<AwsTaskIdentity> | null = null;

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

export const getAwsTaskIdentity = (): AwsTaskIdentity | null => cachedIdentity;

export const hasAwsTaskIdentity = (): boolean =>
	Boolean(cachedIdentity?.serviceArn);

void resolveAwsTaskIdentity();
