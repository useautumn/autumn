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
 * Test-environment override: isolated µVMs (`bun tw`) have no AWS creds, so the
 * S3 poll fails every interval with `CredentialsProviderError`. Setting
 * `AUTUMN_EDGE_CONFIG_OVERRIDE_B64` to base64(JSON) of a `{ [s3Key]: config }`
 * map makes every store serve its entry (or its default) from memory and skip S3
 * entirely — zero credential spam, fully deterministic. Decoded once per process.
 * Unset in prod/dev, so the real S3-backed behaviour is untouched.
 */
let cachedOverride: Record<string, unknown> | null | undefined;
const getEdgeConfigOverride = (): Record<string, unknown> | null => {
	if (cachedOverride !== undefined) {
		return cachedOverride;
	}
	const encoded = process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64;
	if (!encoded) {
		cachedOverride = null;
		return cachedOverride;
	}
	try {
		const json = Buffer.from(encoded, "base64").toString("utf8");
		const parsed = JSON.parse(json);
		cachedOverride =
			parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: {};
	} catch {
		// Malformed override → treat as "override active but empty" so we still
		// skip S3 (the whole point is no creds available) and serve defaults.
		cachedOverride = {};
	}
	return cachedOverride;
};

/**
 * Factory that creates a typed, poll-based edge config backed by S3.
 * Fail-open: any S3 error resets the in-memory config to `defaultValue()`.
 */
export const createEdgeConfigStore = <T>({
	s3Key,
	schema,
	defaultValue,
	pollIntervalMs = process.env.NODE_ENV === "development"
		? ms.seconds(1)
		: ms.seconds(10),
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

	// When the base64 test override is present, seed this store's config from it
	// (or its default) once and operate fully in-memory — no S3, no polling.
	// An explicitly injected s3Client (e.g. a unit test's mock) always wins over
	// the override — that's an explicit request to exercise the real S3 path.
	const override = injectedS3Client ? null : getEdgeConfigOverride();
	if (override) {
		const raw = override[s3Key];
		try {
			runtimeConfig = raw === undefined ? defaultValue() : schema.parse(raw);
		} catch {
			runtimeConfig = defaultValue();
		}
		runtimeStatus = {
			configured: true,
			healthy: true,
			lastFetchAt: nowIso(),
			lastSuccessAt: nowIso(),
		};
	}

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
		// Override mode: serve the in-memory (env-seeded) config, never touch S3.
		if (override) {
			return runtimeConfig;
		}

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
		// Override mode: update the in-memory config only (no S3 creds available).
		if (override) {
			runtimeConfig = config;
			runtimeStatus = {
				configured: true,
				healthy: true,
				lastFetchAt: nowIso(),
				lastSuccessAt: nowIso(),
			};
			return;
		}

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
		// Override mode: config is fixed from env; nothing to refresh.
		if (override) {
			return;
		}

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
			const errMsg =
				error instanceof Error ? error.message : "Failed to load config";
			const previouslyHealthy = runtimeStatus.healthy;
			const sameError = runtimeStatus.error === errMsg;

			runtimeConfig = defaultValue();
			runtimeStatus = {
				configured: true,
				healthy: false,
				lastFetchAt: runtimeStatus.lastFetchAt,
				lastSuccessAt: runtimeStatus.lastSuccessAt,
				error: errMsg,
			};

			// Log on first failure or whenever the error changes. Suppresses the
			// poll-loop spam that otherwise fires every pollIntervalMs when S3
			// credentials are missing/invalid in dev.
			if (previouslyHealthy || !sameError) {
				logger?.warn(`Failed to refresh edge config "${s3Key}": ${error}`);
			}
		}
	};

	const startPolling = async ({ logger }: { logger?: Logger } = {}) => {
		// Override mode: config is fixed from env; never start the S3 poll loop.
		if (override) {
			return;
		}
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
		/** Sets in-memory config without writing to S3. For testing only. */
		_setRuntimeConfigForTesting: (config: T) => {
			runtimeConfig = config;
		},
	};
};

export type EdgeConfigStore<T = unknown> = ReturnType<
	typeof createEdgeConfigStore<T>
>;
