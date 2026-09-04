import type { AutumnLogger } from "@autumn/logging";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { z } from "zod/v4";
import {
	type MiscRedisConfig,
	MiscRedisConfigSchema,
} from "./miscRedisConfigSchemas.js";

export const MISC_REDIS_CONFIG_KEY = "admin/main-redis-cache-config.json";

export type MiscRedisConfigStatus = {
	configured: boolean;
	healthy: boolean;
	lastFetchAt?: string;
	lastSuccessAt?: string;
	error?: string;
};

export type MiscRedisConfigS3Client = {
	send: (
		command: GetObjectCommand | PutObjectCommand,
	) => Promise<{ Body?: { transformToString: () => Promise<string> } }>;
};

export type MiscRedisConfigStore = ReturnType<
	typeof createMiscRedisConfigStore
>;

const defaultMiscRedisConfig = (): MiscRedisConfig => ({
	activeInstance: "main",
	ramp: null,
	backup: null,
});

const nowIso = (): string => new Date().toISOString();

const parseOverride = ({
	encoded,
	schema,
}: {
	encoded?: string;
	schema: z.ZodType<MiscRedisConfig>;
}): MiscRedisConfig | null => {
	if (!encoded) return null;
	try {
		const overrides = JSON.parse(
			Buffer.from(encoded, "base64").toString("utf8"),
		) as Record<string, unknown>;
		const raw = overrides[MISC_REDIS_CONFIG_KEY];
		return raw === undefined ? defaultMiscRedisConfig() : schema.parse(raw);
	} catch {
		return defaultMiscRedisConfig();
	}
};

export const createMiscRedisConfigStore = ({
	getLocation,
	createS3Client,
	logger,
	afterWrite,
	pollIntervalMs = 10_000,
	overrideBase64 = process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64,
}: {
	getLocation: () => { bucket: string; region: string };
	createS3Client: ({ region }: { region: string }) => MiscRedisConfigS3Client;
	logger: AutumnLogger;
	afterWrite?: () => Promise<unknown>;
	pollIntervalMs?: number;
	overrideBase64?: string;
}) => {
	const override = parseOverride({
		encoded: overrideBase64,
		schema: MiscRedisConfigSchema,
	});
	let runtimeConfig = override ?? defaultMiscRedisConfig();
	let runtimeStatus: MiscRedisConfigStatus = override
		? {
				configured: true,
				healthy: true,
				lastFetchAt: nowIso(),
				lastSuccessAt: nowIso(),
			}
		: {
				configured: false,
				healthy: false,
				error: "Misc Redis config not yet initialized",
			};
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const readFromSource = async (): Promise<MiscRedisConfig> => {
		if (override) return runtimeConfig;
		const { bucket, region } = getLocation();
		if (!bucket) return defaultMiscRedisConfig();
		try {
			const response = await createS3Client({ region }).send(
				new GetObjectCommand({ Bucket: bucket, Key: MISC_REDIS_CONFIG_KEY }),
			);
			if (!response.Body) return defaultMiscRedisConfig();
			const raw = (await response.Body.transformToString()).trim();
			return raw
				? MiscRedisConfigSchema.parse(JSON.parse(raw))
				: defaultMiscRedisConfig();
		} catch (error) {
			if (error instanceof Error && error.name === "NoSuchKey") {
				return defaultMiscRedisConfig();
			}
			throw error;
		}
	};

	const writeToSource = async ({
		config,
	}: {
		config: MiscRedisConfig;
	}): Promise<void> => {
		const parsed = MiscRedisConfigSchema.parse(config);
		if (!override) {
			const { bucket, region } = getLocation();
			if (!bucket) throw new Error("Misc Redis config S3 is not configured");
			await createS3Client({ region }).send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: MISC_REDIS_CONFIG_KEY,
					Body: JSON.stringify(parsed, null, 2),
					ContentType: "application/json",
				}),
			);
			try {
				await afterWrite?.();
			} catch (error) {
				logger.error(
					`Misc Redis config written but propagation signal failed: ${error}`,
				);
			}
		}
		runtimeConfig = parsed;
		runtimeStatus = {
			configured: true,
			healthy: true,
			lastFetchAt: nowIso(),
			lastSuccessAt: nowIso(),
		};
	};

	const refresh = async (): Promise<void> => {
		if (override) return;
		const lastFetchAt = nowIso();
		try {
			runtimeConfig = await readFromSource();
			runtimeStatus = {
				configured: Boolean(getLocation().bucket),
				healthy: true,
				lastFetchAt,
				lastSuccessAt: nowIso(),
			};
		} catch (error) {
			runtimeStatus = {
				...runtimeStatus,
				configured: Boolean(getLocation().bucket),
				healthy: false,
				lastFetchAt,
				error: error instanceof Error ? error.message : String(error),
			};
			logger.warn(`Failed to refresh misc Redis config: ${error}`);
		}
	};

	const startPolling = async (): Promise<void> => {
		if (pollTimer) return;
		await refresh();
		if (override) return;
		pollTimer = setInterval(() => void refresh(), pollIntervalMs);
	};

	const stopPolling = (): void => {
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
		_setRuntimeConfigForTesting: (config: MiscRedisConfig) => {
			runtimeConfig = MiscRedisConfigSchema.parse(config);
		},
	};
};
