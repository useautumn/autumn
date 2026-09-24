const DEFAULT_AWS_REGION = "us-east-2";

const trimmed = (value: string | undefined): string | undefined =>
	value?.trim() || undefined;

/** What a process needs to open the misc cache: the main instance's URL and where the process runs. */
export function createCacheEnv(runtimeEnv: Record<string, string | undefined>) {
	// ECS injects this; unset everywhere else, so it is the "am I inside AWS" gate.
	const onEcs = Boolean(runtimeEnv.ECS_CONTAINER_METADATA_URI_V4);
	const privateUrl = trimmed(runtimeEnv.MISC_CACHE_DRAGONFLY_PRIVATE_URL);
	const publicUrl = trimmed(runtimeEnv.MISC_CACHE_DRAGONFLY_PUBLIC_URL);
	const mainUrl =
		onEcs && privateUrl ? privateUrl : (publicUrl ?? privateUrl ?? null);
	return {
		CACHE_ON_ECS: onEcs,
		/** Telemetry and client label only. */
		CACHE_REGION: runtimeEnv.AWS_REGION || DEFAULT_AWS_REGION,
		/** Null where no misc cache is configured (unit tests, some scripts). */
		MISC_CACHE_MAIN_URL: mainUrl,
		MISC_CACHE_COMMAND_TIMEOUT_MS:
			runtimeEnv.NODE_ENV === "production" ? 10_000 : 60_000,
		/** Decrypts the backup connection in the edge config; null leaves the backup unroutable. */
		CACHE_ENCRYPTION_PASSWORD: trimmed(runtimeEnv.ENCRYPTION_PASSWORD) ?? null,
		/** The admin bucket the misc-redis edge config is polled from. */
		CACHE_EDGE_CONFIG_LOCATION: {
			bucket: trimmed(runtimeEnv.S3_BUCKET) ?? "autumn-prod-server",
			region: trimmed(runtimeEnv.S3_REGION) ?? DEFAULT_AWS_REGION,
		},
	};
}

export type CacheEnv = ReturnType<typeof createCacheEnv>;
let cacheEnv: CacheEnv | undefined;

/** Read at first use, never at import: env may be injected after import (infisical). */
export function getCacheEnv(): CacheEnv {
	cacheEnv ??= createCacheEnv(process.env);
	return cacheEnv;
}
