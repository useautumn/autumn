import type { Redis } from "ioredis";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getReachableDragonflyUrl } from "@/external/redis/getReachableDragonflyUrl.js";
import {
	createRedisConnection,
	currentRegion,
} from "@/external/redis/initRedis.js";
import { REDIS_V2_COMMAND_TIMEOUT_MS } from "@/external/redis/initUtils/redisV2Config.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { getDragonflyRampConfig } from "./dragonflyRampStore.js";

type CachedClient = { url: string; instance: Redis };
let cached: CachedClient | null = null;
let lastDecryptFailureUrl: string | null = null;

/** Returns the Redis client for the ramp destination configured in the edge config.
 *
 *  Lazy: creates the client on first call after the destination URL is set.
 *  Hot-swappable: when the admin changes the destination URL, the next call
 *  disconnects the old client and creates a new one keyed on the new URL.
 *  Returns null when no destination is configured (ramp is dormant). */
export const getRampDestinationRedis = (): Redis | null => {
	const config = getDragonflyRampConfig();
	if (!config.destination) {
		closeRampDestinationClient();
		return null;
	}

	const { connectionString, url } = config.destination;

	if (cached && cached.url === url) return cached.instance;

	if (cached) {
		logger.info(
			`[dragonflyRamp] destination URL changed (${cached.url} -> ${url}); disconnecting old client`,
		);
		try {
			cached.instance.disconnect();
		} catch (error) {
			logger.warn(
				`[dragonflyRamp] failed to disconnect old destination client: ${error}`,
			);
		}
		cached = null;
	}

	let decrypted: string;
	try {
		decrypted = decryptData(connectionString);
	} catch (error) {
		if (lastDecryptFailureUrl !== url) {
			lastDecryptFailureUrl = url;
			logger.error(
				`[dragonflyRamp] failed to decrypt destination connectionString for ${url}: ${error}. Ramp will route to primary until fixed.`,
			);
		}
		return null;
	}
	lastDecryptFailureUrl = null;

	const reachable = getReachableDragonflyUrl(decrypted);
	const instance = createRedisConnection({
		cacheUrl: reachable,
		region: `${currentRegion}:v2:ramp`,
		supportsUpstashShebang: false,
		commandTimeout: REDIS_V2_COMMAND_TIMEOUT_MS,
	});

	instance.on("error", (error) => {
		logger.error(`[dragonflyRamp] destination=${url}: ${error.message}`);
	});

	instance.on("ready", () => {
		logger.info(`[dragonflyRamp] destination=${url}: connected`);
	});

	cached = { url, instance };
	return instance;
};

/** Tear down the cached destination client. Safe to call multiple times. */
export const closeRampDestinationClient = () => {
	if (!cached) return;
	try {
		cached.instance.disconnect();
	} catch (error) {
		logger.warn(
			`[dragonflyRamp] failed to disconnect destination client during close: ${error}`,
		);
	}
	cached = null;
};

/** Test-only: inject a Redis instance directly, bypassing the config + decryption. */
export const _setRampDestinationClientForTesting = (
	client: { url: string; instance: Redis } | null,
) => {
	if (cached && cached.url !== client?.url) {
		try {
			cached.instance.disconnect();
		} catch {
			// best effort
		}
	}
	cached = client;
};
