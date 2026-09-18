import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { z } from "zod/v4";
import { EdgeConfigNotConfiguredError } from "../errors.js";
import {
	createBunS3EdgeConfigClient,
	getS3BodyAsString,
} from "../s3/bunS3EdgeConfigClient.js";
import { writeEdgeConfigTimestamp } from "../s3/edgeConfigTimestamp.js";
import type {
	EdgeConfigContext,
	EdgeConfigLogger,
	EdgeConfigStatus,
} from "../types/edgeConfig.js";

const ONE_SECOND_MS = 1_000;
const TEN_SECONDS_MS = 10_000;

const nowIso = () => new Date().toISOString();

/**
 * Test-environment override: isolated µVMs have no AWS creds, so the S3 poll would fail every
 * interval. `AUTUMN_EDGE_CONFIG_OVERRIDE_B64` = base64(JSON) of a `{ [s3Key]: config }` map makes
 * every store serve its entry (or its default) from memory and skip S3. Decoded once per process.
 */
let cachedOverride: Record<string, unknown> | null | undefined;
const getEdgeConfigOverride = (): Record<string, unknown> | null => {
	if (cachedOverride !== undefined) return cachedOverride;
	const encoded = process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64;
	if (!encoded) {
		cachedOverride = null;
		return cachedOverride;
	}
	try {
		const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
		cachedOverride =
			parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: {};
	} catch {
		// Malformed override: still skip S3 (no creds is the whole point), serve defaults.
		cachedOverride = {};
	}
	return cachedOverride;
};

/**
 * A typed, poll-based config backed by one S3 object. Fails open: on any S3 failure the store
 * serves `defaultValue()` again unless `retainOnError` keeps the last good value.
 */
export const createEdgeConfigStore = <T>({
	ctx,
	s3Key,
	schema,
	defaultValue,
	retainOnError = false,
	pollIntervalMs = process.env.NODE_ENV === "development"
		? ONE_SECOND_MS
		: TEN_SECONDS_MS,
}: {
	ctx: EdgeConfigContext;
	s3Key: string;
	schema: z.ZodType<T>;
	defaultValue: () => T;
	retainOnError?: boolean;
	pollIntervalMs?: number;
}) => {
	let runtimeConfig: T = defaultValue();
	let runtimeStatus: EdgeConfigStatus = {
		configured: false,
		healthy: false,
		error: "Edge config not yet initialized",
	};
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	// Override mode seeds the config once and never touches S3.
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
		const { bucket, region } = ctx.location();
		return { bucket, region, key: s3Key, configured: Boolean(bucket && s3Key) };
	};

	const resolveClient = () =>
		ctx.s3Client ??
		createBunS3EdgeConfigClient({ region: getConfigLocation().region });

	const readFromSource = async (): Promise<T> => {
		if (override) return runtimeConfig;
		const { bucket, key, configured } = getConfigLocation();
		if (!configured || !bucket || !key) return defaultValue();
		try {
			const response = await resolveClient().send(
				new GetObjectCommand({ Bucket: bucket, Key: key }),
			);
			if (!response.Body) return defaultValue();
			const raw = (await getS3BodyAsString({ body: response.Body })).trim();
			if (!raw) return defaultValue();
			return schema.parse(JSON.parse(raw));
		} catch (error) {
			if (error instanceof Error && error.name === "NoSuchKey")
				return defaultValue();
			throw error;
		}
	};

	const writeToSource = async ({
		config,
		logger,
	}: {
		config: T;
		logger?: EdgeConfigLogger;
	}) => {
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
		if (!configured || !bucket || !key)
			throw new EdgeConfigNotConfiguredError();
		const client = resolveClient();
		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: JSON.stringify(config, null, 2),
				ContentType: "application/json",
			}),
		);
		// The config object is durable by now; a lost signal must not fail the write, the backstop refresh catches it.
		try {
			await writeEdgeConfigTimestamp({ ctx: { ...ctx, s3Client: client } });
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

	const refresh = async ({ logger }: { logger?: EdgeConfigLogger } = {}) => {
		if (override) return;
		const { configured } = getConfigLocation();
		runtimeStatus = { ...runtimeStatus, configured, lastFetchAt: nowIso() };
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
			runtimeConfig = await readFromSource();
			runtimeStatus = {
				configured: true,
				healthy: true,
				lastFetchAt: runtimeStatus.lastFetchAt,
				lastSuccessAt: nowIso(),
			};
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load config";
			const previouslyHealthy = runtimeStatus.healthy;
			const sameError = runtimeStatus.error === message;
			if (!retainOnError) runtimeConfig = defaultValue();
			runtimeStatus = {
				configured: true,
				healthy: false,
				lastFetchAt: runtimeStatus.lastFetchAt,
				lastSuccessAt: runtimeStatus.lastSuccessAt,
				error: message,
			};
			// First failure or a new error only: the poll loop would otherwise log every interval.
			if (previouslyHealthy || !sameError) {
				logger?.warn(`Failed to refresh edge config "${s3Key}": ${error}`);
			}
		}
	};

	const startPolling = async ({
		logger,
	}: {
		logger?: EdgeConfigLogger;
	} = {}) => {
		if (override || pollTimer) return;
		await refresh({ logger });
		pollTimer = setInterval(() => {
			void refresh({ logger });
		}, pollIntervalMs);
	};

	const stopPolling = () => {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
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
