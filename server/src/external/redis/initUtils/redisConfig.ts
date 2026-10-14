import { getCacheEnv } from "@autumn/env/cache";

export const currentRegion = getCacheEnv().CACHE_REGION;

export const resolveMiscMainUrl = (): string | null =>
	getCacheEnv().MISC_CACHE_MAIN_URL;

export const hasMiscRedisConfig = Boolean(resolveMiscMainUrl());
