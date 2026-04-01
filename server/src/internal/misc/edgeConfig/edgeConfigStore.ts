import { ErrCode, ms } from "@autumn/shared";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { z } from "zod/v4";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import { getS3Client } from "@/external/aws/s3/initS3.js";
import { getS3BodyAsString } from "@/external/aws/s3/s3Utils.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import RecaseError from "@/utils/errorUtils.js";

export type EdgeConfigStatus = {
	configured: boolean;
	healthy: boolean;
	lastFetchAt?: string;
	lastSuccessAt?: string;
	error?: string;
};

const nowIso = () => new Date().toISOString();

/**
 * Factory that creates a typed, poll-based edge config backed by S3.
 * Fail-open: any S3 error resets the in-memory config to `defaultValue()`.
 */
export const createEdgeConfigStore = <T>({
	s3Key,
	schema,
	defaultValue,
	pollIntervalMs = ms.seconds(30),
	s3Client: injectedS3Client,
}: {
	s3Key: string;
	schema: z.ZodType<T>;
	defaultValue: () => T;
	pollIntervalMs?: number;
	s3Client?: S3Client;
}) => {
	let runtimeConfig: T = defaultValue();
	let runtimeStatus: EdgeConfigStatus = {
		configured: false,
		healthy: false,
		error: "Edge config not yet initialized",
	};
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const getConfigLocation = () => {
		const { bucket, region } = getAdminS3Config();
		return {
			bucket,
			region,
			key: s3Key,
			configured: Boolean(bucket && s3Key),
		};
	};

	const resolveClient = () => {
		if (injectedS3Client) return injectedS3Client;
		const { region } = getConfigLocation();
		return getS3Client({ region });
	};

	const readFromSource = async (): Promise<T> => {
		const { bucket, key, configured } = getConfigLocation();

		if (!configured || !bucket || !key) return defaultValue();

		const client = resolveClient();
		try {
			const response = await client.send(
				new GetObjectCommand({ Bucket: bucket, Key: key }),
			);

			if (!response.Body) return defaultValue();

			const raw = (await getS3BodyAsString({ body: response.Body })).trim();
			if (!raw) return defaultValue();

			return schema.parse(JSON.parse(raw));
		} catch (error) {
			const name = error instanceof Error ? error.name : "";
			if (name === "NoSuchKey") return defaultValue();
			throw error;
		}
	};

	const writeToSource = async ({ config }: { config: T }) => {
		const { bucket, key, configured } = getConfigLocation();

		if (!configured || !bucket || !key) {
			throw new RecaseError({
				message: "Edge config S3 is not configured",
				code: ErrCode.InvalidRequest,
				statusCode: 503,
			});
		}

		const client = resolveClient();
		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: JSON.stringify(config, null, 2),
				ContentType: "application/json",
			}),
		);

		runtimeConfig = config;
		runtimeStatus = {
			configured: true,
			healthy: true,
			lastFetchAt: nowIso(),
			lastSuccessAt: nowIso(),
		};
	};

	const refresh = async ({ logger }: { logger?: Logger } = {}) => {
		const { configured } = getConfigLocation();
		runtimeStatus = {
			...runtimeStatus,
			configured,
			lastFetchAt: nowIso(),
		};

		if (!configured) {
			runtimeConfig = defaultValue();
			runtimeStatus = {
				configured: false,
				healthy: false,
				lastFetchAt: runtimeStatus.lastFetchAt,
				lastSuccessAt: runtimeStatus.lastSuccessAt,
				error: "Edge config S3 is not configured",
			};
			return;
		}

		try {
			const config = await readFromSource();
			runtimeConfig = config;
			runtimeStatus = {
				configured: true,
				healthy: true,
				lastFetchAt: runtimeStatus.lastFetchAt,
				lastSuccessAt: nowIso(),
			};
		} catch (error) {
			runtimeConfig = defaultValue();
			runtimeStatus = {
				configured: true,
				healthy: false,
				lastFetchAt: runtimeStatus.lastFetchAt,
				lastSuccessAt: runtimeStatus.lastSuccessAt,
				error: error instanceof Error ? error.message : "Failed to load config",
			};
			logger?.warn(`Failed to refresh edge config "${s3Key}": ${error}`);
		}
	};

	const startPolling = async ({ logger }: { logger?: Logger } = {}) => {
		if (pollTimer) return;

		await refresh({ logger });
		pollTimer = setInterval(() => {
			void refresh({ logger });
		}, pollIntervalMs);
	};

	const stopPolling = () => {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	};

	return {
		get: () => runtimeConfig,
		getStatus: () => runtimeStatus,
		refresh,
		startPolling,
		stopPolling,
		readFromSource,
		writeToSource,
	};
};

export type EdgeConfigStore<T = unknown> = ReturnType<
	typeof createEdgeConfigStore<T>
>;
