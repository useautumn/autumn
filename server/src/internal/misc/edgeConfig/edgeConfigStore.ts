import { ErrCode, ms } from "@autumn/shared";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { z } from "zod/v4";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import {
	createBunS3EdgeConfigClient,
	type EdgeConfigS3Client,
} from "@/external/aws/s3/bunS3EdgeConfigClient.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import {
	type EdgeConfigFollower,
	getEdgeConfigFollower,
} from "./edgeConfigFollower.js";
import { writeEdgeConfigTimestamp } from "./edgeConfigTimestamp.js";
import { readEdgeConfigRaw } from "./readEdgeConfigRaw.js";

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
 * Refresh failures keep the last good config; defaultValue() serves until the first success.
 */
export const createEdgeConfigStore = <T>({
	s3Key,
	schema,
	defaultValue,
	pollIntervalMs = process.env.NODE_ENV === "development"
		? ms.seconds(1)
		: ms.seconds(10),
	s3Client: injectedS3Client,
	follower,
}: {
	s3Key: string;
	schema: z.ZodType<T>;
	defaultValue: () => T;
	pollIntervalMs?: number;
	s3Client?: EdgeConfigS3Client;
	/** Undefined resolves the process-wide follower (cluster forks only). */
	follower?: EdgeConfigFollower | null;
}) => {
	let runtimeConfig: T = defaultValue();
	let runtimeStatus: EdgeConfigStatus = {
		configured: false,
		healthy: false,
		error: "Edge config not yet initialized",
	};
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let following = false;

	// When the base64 test override is present, seed this store's config from it
	// (or its default) once and operate fully in-memory — no S3, no polling.
	const override = getEdgeConfigOverride();
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
		return createBunS3EdgeConfigClient({ region });
	};

	const parseRaw = (raw: string | null): T => {
		const body = raw?.trim();
		return body ? schema.parse(JSON.parse(body)) : defaultValue();
	};

	const readFromSource = async (): Promise<T> => {
		// Override mode: serve the in-memory (env-seeded) config, never touch S3.
		if (override) {
			return runtimeConfig;
		}

		const { key, configured } = getConfigLocation();
		if (!configured) return defaultValue();

		return parseRaw(
			await readEdgeConfigRaw({ key, s3Client: resolveClient() }),
		);
	};

	const writeToSource = async ({
		config,
		logger,
	}: {
		config: T;
		logger?: Logger;
	}) => {
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
		// The config object is durable by now, so a lost signal must not fail the
		// write or strand this process on the old value; the backstop still catches it.
		try {
			await writeEdgeConfigTimestamp({ s3Client: client, logger });
		} catch (error) {
			logger?.error(
				`Edge config "${s3Key}" written but timestamp signal failed; propagation waits for the backstop refresh: ${error}`,
			);
		}

		runtimeConfig = config;
		runtimeStatus = {
			configured: true,
			healthy: true,
			lastFetchAt: nowIso(),
			lastSuccessAt: nowIso(),
		};
	};

	const markFailed = ({
		error,
		logger,
	}: {
		error: unknown;
		logger?: Logger;
	}) => {
		const errMsg =
			error instanceof Error ? error.message : "Failed to load config";
		const previouslyHealthy = runtimeStatus.healthy;
		const sameError = runtimeStatus.error === errMsg;

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
	};

	/** Parses a body fetched elsewhere (the cluster relay) exactly as refresh
	 *  would: null/empty serves the default, a bad body keeps the last good one. */
	const applyRaw = ({
		raw,
		logger,
	}: {
		raw: string | null;
		logger?: Logger;
	}) => {
		if (override) return;
		runtimeStatus = { ...runtimeStatus, lastFetchAt: nowIso() };
		try {
			runtimeConfig = parseRaw(raw);
			runtimeStatus = {
				configured: true,
				healthy: true,
				lastFetchAt: runtimeStatus.lastFetchAt,
				lastSuccessAt: nowIso(),
			};
		} catch (error) {
			markFailed({ error, logger });
		}
	};

	const refresh = async ({ logger }: { logger?: Logger } = {}) => {
		// Override mode: config is fixed from env; nothing to refresh.
		if (override) {
			return;
		}

		const { key, configured } = getConfigLocation();
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

		let raw: string | null;
		try {
			raw = await readEdgeConfigRaw({ key, s3Client: resolveClient() });
		} catch (error) {
			markFailed({ error, logger });
			return;
		}
		applyRaw({ raw, logger });
	};

	const startPolling = async ({ logger }: { logger?: Logger } = {}) => {
		// Override mode: config is fixed from env; never start the S3 poll loop.
		if (override) {
			return;
		}
		if (pollTimer || following) return;

		// Cluster forks take this key from the primary's relay at its own interval.
		const activeFollower =
			follower === undefined ? getEdgeConfigFollower() : follower;
		if (activeFollower) {
			following = true;
			const { timedOutKeys } = await activeFollower.follow({
				entries: [
					{ key: s3Key, pollIntervalMs, store: { applyRaw, markFailed } },
				],
				logger,
			});
			if (timedOutKeys.length === 0) return;
		}

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
		s3Key,
		get: () => runtimeConfig,
		getStatus: () => runtimeStatus,
		refresh,
		applyRaw,
		markFailed,
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
