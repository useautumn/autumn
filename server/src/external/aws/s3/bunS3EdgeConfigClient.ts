// Bun-native S3 client shaped like the SDK's `send()` for edge-config use:
// avoids the SDK middleware churn that dominated idle allocation.
import type { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

type EdgeConfigS3CommandInput = {
	Bucket?: string;
	Key?: string;
	Body?: string;
	ContentType?: string;
};

// Command-union typing keeps real SDK clients injectable in tests and scripts.
export type EdgeConfigS3Client = {
	send: (command: GetObjectCommand | PutObjectCommand) => Promise<{
		Body?: { transformToString: (encoding?: string) => Promise<string> };
	}>;
};

type ContainerCredentials = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken: string;
	expiresAt: number;
};

const CREDENTIALS_REFRESH_MARGIN_MS = 5 * 60_000;

let containerCredentials: ContainerCredentials | null = null;
const bunClientCache = new Map<string, InstanceType<typeof Bun.S3Client>>();

// Bun.S3Client only reads env/static credentials, so Fargate task-role
// credentials must be fetched from the ECS container endpoint ourselves.
const resolveContainerCredentials =
	async (): Promise<ContainerCredentials | null> => {
		const relativeUri = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
		const fullUri = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
		if (!relativeUri && !fullUri) return null;

		const fresh =
			containerCredentials &&
			Date.now() <
				containerCredentials.expiresAt - CREDENTIALS_REFRESH_MARGIN_MS;
		if (fresh) return containerCredentials;

		const url = relativeUri
			? `http://169.254.170.2${relativeUri}`
			: (fullUri as string);
		const tokenFile = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE;
		const authToken =
			process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN ??
			(tokenFile ? (await Bun.file(tokenFile).text()).trim() : undefined);
		// A stalled metadata endpoint must not hang boot: polling start is awaited.
		const response = await fetch(url, {
			signal: AbortSignal.timeout(5_000),
			...(authToken ? { headers: { Authorization: authToken } } : {}),
		});
		if (!response.ok) {
			throw new Error(
				`Container credentials endpoint returned ${response.status}`,
			);
		}
		const raw = (await response.json()) as {
			AccessKeyId: string;
			SecretAccessKey: string;
			Token: string;
			Expiration: string;
		};
		containerCredentials = {
			accessKeyId: raw.AccessKeyId,
			secretAccessKey: raw.SecretAccessKey,
			sessionToken: raw.Token,
			expiresAt: Date.parse(raw.Expiration),
		};
		bunClientCache.clear();
		return containerCredentials;
	};

const getBunClient = async ({
	bucket,
	region,
}: {
	bucket: string;
	region: string;
}) => {
	const credentials = await resolveContainerCredentials();
	const cacheKey = `${bucket}:${region}:${credentials?.expiresAt ?? "env"}`;
	const cached = bunClientCache.get(cacheKey);
	if (cached) return cached;

	const client = new Bun.S3Client({
		bucket,
		region,
		...(credentials
			? {
					accessKeyId: credentials.accessKeyId,
					secretAccessKey: credentials.secretAccessKey,
					sessionToken: credentials.sessionToken,
				}
			: {}),
	});
	bunClientCache.set(cacheKey, client);
	return client;
};

// Callers branch on `error.name === "NoSuchKey"`; Bun reports it via `code`.
const normalizeNoSuchKey = (error: unknown): unknown => {
	const code = (error as { code?: string } | null)?.code;
	if (code !== "NoSuchKey") return error;
	const normalized = new Error("The specified key does not exist.");
	normalized.name = "NoSuchKey";
	return normalized;
};

export const createBunS3EdgeConfigClient = ({
	region,
}: {
	region: string;
}): EdgeConfigS3Client => ({
	send: async (command) => {
		const { Bucket, Key, Body, ContentType } =
			command.input as EdgeConfigS3CommandInput;
		if (!Bucket || !Key) {
			throw new Error("Edge config S3 command requires Bucket and Key");
		}
		const client = await getBunClient({ bucket: Bucket, region });

		if (Body === undefined) {
			let text: string;
			try {
				text = await client.file(Key).text();
			} catch (error) {
				throw normalizeNoSuchKey(error);
			}
			return { Body: { transformToString: async () => text } };
		}

		await client
			.file(Key)
			.write(Body, ContentType ? { type: ContentType } : undefined);
		return {};
	},
});
