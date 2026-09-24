import { createMiscCache, type MiscCache } from "@autumn/cache";
import { getCacheEnv } from "@autumn/env/cache";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedisConfig } from "@/internal/misc/miscRedisConfig/miscRedisConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { onRedisClientCreated } from "../initUtils/onRedisClientCreated.js";

let miscCache: MiscCache | undefined;

/** The server's misc cache: its env, its polled edge config, its secret decryption, and otel on every client. */
export const getMiscCache = (): MiscCache => {
	if (miscCache) return miscCache;
	const env = getCacheEnv();
	miscCache = createMiscCache({
		ctx: {
			logger,
			onClientCreated: onRedisClientCreated,
			config: getMiscRedisConfig,
			env: {
				mainUrl: env.MISC_CACHE_MAIN_URL,
				region: env.CACHE_REGION,
				onEcs: env.CACHE_ON_ECS,
			},
			decrypt: decryptData,
		},
		config: { commandTimeoutMs: env.MISC_CACHE_COMMAND_TIMEOUT_MS },
	});
	return miscCache;
};
