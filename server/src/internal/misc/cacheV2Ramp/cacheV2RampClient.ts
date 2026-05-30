import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getReachableDragonflyUrl } from "@/external/redis/getReachableDragonflyUrl.js";
import {
	createRedisConnection,
	currentRegion,
} from "@/external/redis/initRedis.js";
import { REDIS_V2_COMMAND_TIMEOUT_MS } from "@/external/redis/initUtils/redisV2Config.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { getCacheV2RampConfig } from "./cacheV2RampStore.js";

type CachedClient = {
	url: string;
	connectionString: string;
	instance: Redis;
};
let cached: CachedClient | null = null;
let lastDecryptFailureKey: string | null = null;

/** Returns the Redis client for the ramp destination configured in the edge config.
 *
 *  Lazy: creates the client on first call after the destination is set.
 *  Hot-swappable: when the admin changes the URL OR rotates the encrypted
 *  connection string (e.g. credential rotation on the same host), the next
 *  call disconnects the old client and creates a new one. Returns null when
 *  no destination is configured (ramp is dormant). */
export const getRampDestinationRedis = (): Redis | null => {
	const config = getCacheV2RampConfig();
	if (!config) {
		closeRampDestinationClient();
		return null;
	}

	const { connectionString, url } = config;

	if (
		cached &&
		cached.url === url &&
		cached.connectionString === connectionString
	) {
		return cached.instance;
	}

	if (cached) {
		const reason =
			cached.url !== url
				? `URL changed (${cached.url} -> ${url})`
				: "credentials rotated";
		logger.info(
			`[cacheV2Ramp] destination ${reason}; disconnecting old client`,
		);
		try {
			cached.instance.disconnect();
		} catch (error) {
			logger.warn(
				`[cacheV2Ramp] failed to disconnect old destination client: ${error}`,
			);
		}
		cached = null;
	}

	let decrypted: string;
	try {
		decrypted = decryptData(connectionString);
	} catch (error) {
		const failureKey = `${url}|${connectionString}`;
		if (lastDecryptFailureKey !== failureKey) {
			lastDecryptFailureKey = failureKey;
			logger.error(
				`[cacheV2Ramp] failed to decrypt destination connectionString for ${url}: ${error}. Ramp will route to primary until fixed.`,
			);
		}
		return null;
	}
	lastDecryptFailureKey = null;

	const reachable = getReachableDragonflyUrl(decrypted);
	const instance = createRedisConnection({
		cacheUrl: reachable,
		region: `${currentRegion}:v2:ramp`,
		supportsUpstashShebang: false,
		commandTimeout: REDIS_V2_COMMAND_TIMEOUT_MS,
	});

	instance.on("error", (error) => {
		logger.error(`[cacheV2Ramp] destination=${url}: ${error.message}`);
	});

	instance.on("ready", () => {
		logger.info(`[cacheV2Ramp] destination=${url}: connected`);
	});

	cached = { url, connectionString, instance };
	return instance;
};

/** Tear down the cached destination client. Safe to call multiple times. */
export const closeRampDestinationClient = () => {
	if (!cached) return;
	try {
		cached.instance.disconnect();
	} catch (error) {
		logger.warn(
			`[cacheV2Ramp] failed to disconnect destination client during close: ${error}`,
		);
	}
	cached = null;
};

/** Test-only: inject a Redis instance directly, bypassing the config + decryption. */
export const _setRampDestinationClientForTesting = (
	client: {
		url: string;
		connectionString: string;
		instance: Redis;
	} | null,
) => {
	if (
		cached &&
		(cached.url !== client?.url ||
			cached.connectionString !== client?.connectionString)
	) {
		try {
			cached.instance.disconnect();
		} catch {
			// best effort
		}
	}
	cached = client;
};
