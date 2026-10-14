const DEFAULT_AWS_REGION = "us-east-2";

const trimmed = (value: string | undefined): string | undefined =>
	value?.trim() || undefined;

export function createCacheEnv(runtimeEnv: Record<string, string | undefined>) {
	const onEcs = Boolean(runtimeEnv.ECS_CONTAINER_METADATA_URI_V4);
	const privateUrl = trimmed(runtimeEnv.MISC_CACHE_DRAGONFLY_PRIVATE_URL);
	const publicUrl = trimmed(runtimeEnv.MISC_CACHE_DRAGONFLY_PUBLIC_URL);
	const mainUrl =
		onEcs && privateUrl ? privateUrl : (publicUrl ?? privateUrl ?? null);
	return {
		CACHE_ON_ECS: onEcs,
		CACHE_REGION: runtimeEnv.AWS_REGION || DEFAULT_AWS_REGION,
		MISC_CACHE_MAIN_URL: mainUrl,
		MISC_CACHE_COMMAND_TIMEOUT_MS:
			runtimeEnv.NODE_ENV === "production" ? 10_000 : 60_000,
		CACHE_ENCRYPTION_PASSWORD: trimmed(runtimeEnv.ENCRYPTION_PASSWORD) ?? null,
		CACHE_EDGE_CONFIG_LOCATION: {
			bucket: trimmed(runtimeEnv.S3_BUCKET) ?? "autumn-prod-server",
			region: trimmed(runtimeEnv.S3_REGION) ?? DEFAULT_AWS_REGION,
		},
	};
}

export type CacheEnv = ReturnType<typeof createCacheEnv>;
let cacheEnv: CacheEnv | undefined;

export function getCacheEnv(): CacheEnv {
	cacheEnv ??= createCacheEnv(process.env);
	return cacheEnv;
}
