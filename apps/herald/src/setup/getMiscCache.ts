import { createMiscCache, type MiscCache } from "@autumn/cache";
import { createAesCipher } from "@autumn/encryption";
import { getCacheEnv } from "@autumn/env/cache";
import { getHeraldEdgeConfigs } from "./getHeraldEdgeConfigs.js";
import { getHeraldLogger } from "./getHeraldLogger.js";

const unroutableBackup = (): string => {
	throw new Error(
		"ENCRYPTION_PASSWORD is not set; backup misc cache is unroutable",
	);
};

/** Herald's misc cache: the same instances, ramp, and keys the server uses. */
export function getMiscCache(): MiscCache {
	miscCache ??= createMiscCache({
		ctx: {
			logger: getHeraldLogger(),
			config: () => getHeraldEdgeConfigs().miscRedis.get(),
			env: {
				mainUrl: getCacheEnv().MISC_CACHE_MAIN_URL,
				region: getCacheEnv().CACHE_REGION,
				onEcs: getCacheEnv().CACHE_ON_ECS,
			},
			decrypt: decryptOf(),
		},
		config: { commandTimeoutMs: getCacheEnv().MISC_CACHE_COMMAND_TIMEOUT_MS },
	});
	return miscCache;
}

let miscCache: MiscCache | undefined;

function decryptOf(): (encrypted: string) => string {
	const password = getCacheEnv().CACHE_ENCRYPTION_PASSWORD;
	return password ? createAesCipher({ password }).decrypt : unroutableBackup;
}
