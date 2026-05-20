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
	const config = getDragonflyRampConfig();
	if (!config.destination) {
		closeRampDestinationClient();
		return null;
	}

	const { connectionString, url } = config.destination;

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
			`[dragonflyRamp] destination ${reason}; gracefully closing old client`,
		);
		// quit() lets in-flight commands complete before closing the socket,
		// avoiding "Connection is closed" errors on requests that still hold a
		// reference to this client via ctx.redisV2.
		cached.instance.quit().catch((error) => {
			logger.warn(
				`[dragonflyRamp] error during old destination client quit: ${error}`,
			);
		});
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
				`[dragonflyRamp] failed to decrypt destination connectionString for ${url}: ${error}. Ramp will route to primary until fixed.`,
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
		logger.error(`[dragonflyRamp] destination=${url}: ${error.message}`);
	});

	instance.on("ready", () => {
		logger.info(`[dragonflyRamp] destination=${url}: connected`);
	});

	cached = { url, connectionString, instance };
	return instance;
};

/** Tear down the cached destination client. Safe to call multiple times.
 *  Uses quit() so in-flight commands held by ctx.redisV2 references can
 *  complete before the socket closes. */
export const closeRampDestinationClient = () => {
	if (!cached) return;
	cached.instance.quit().catch((error) => {
		logger.warn(
			`[dragonflyRamp] error during destination client close: ${error}`,
		);
	});
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
		cached.instance.quit().catch(() => {
			// best effort
		});
	}
	cached = client;
};
