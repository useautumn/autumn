import type { Redis } from "ioredis";
import { resolvePrivateOrPublicUrl } from "@/external/aws/ecs/resolvePrivateOrPublicUrl.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedisConfig } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { createRedisClient } from "../initUtils/createRedisClient.js";
import { currentRegion } from "../initUtils/redisConfig.js";

let mainClient: Redis | null = null;

/** The "main" misc-cache instance: env-configured (CACHE_URL), created on
 *  first use. Lazy on purpose — env may be injected after import (infisical),
 *  so this reads CACHE_URL at call time and throws until it exists; later
 *  calls retry, so the app self-heals once the env lands. */
export const getMiscMainRedis = (): Redis => {
	if (mainClient) return mainClient;

	const cacheUrl = process.env.CACHE_URL?.trim();
	if (!cacheUrl) {
		throw new Error(
			"[Redis] CACHE_URL is not set — the misc cache is required",
		);
	}

	mainClient = createRedisClient({
		cacheUrl,
		region: currentRegion,
		redisType: "misc-primary",
	});
	return mainClient;
};

type CachedBackupClient = {
	publicConnectionString: string;
	privateConnectionString: string | null;
	instance: Redis;
};
let cachedBackup: CachedBackupClient | null = null;
let lastDecryptFailureKey: string | null = null;

/** The "backup" misc-cache instance, from the misc-redis edge config.
 *  Lazy + hot-swappable: a changed or rotated connection disconnects the old
 *  client on the next call. ECS prefers the private endpoint when set;
 *  everything else uses the public one. Null while no backup is configured. */
export const getMiscBackupRedis = (): Redis | null => {
	const backup = getMiscRedisConfig().backup;
	if (!backup) {
		closeMiscBackupClient();
		return null;
	}

	const { publicConnectionString, privateConnectionString, url } = backup;

	if (
		cachedBackup &&
		cachedBackup.publicConnectionString === publicConnectionString &&
		cachedBackup.privateConnectionString === privateConnectionString
	) {
		return cachedBackup.instance;
	}

	if (cachedBackup) {
		logger.info(
			"[miscRedis] backup connection changed; disconnecting old client",
		);
		closeMiscBackupClient();
	}

	const encrypted = resolvePrivateOrPublicUrl({
		privateUrl: privateConnectionString,
		publicUrl: publicConnectionString,
	});

	let decrypted: string;
	try {
		decrypted = decryptData(encrypted);
	} catch (error) {
		const failureKey = `${url}|${encrypted}`;
		if (lastDecryptFailureKey !== failureKey) {
			lastDecryptFailureKey = failureKey;
			logger.error(
				`[miscRedis] failed to decrypt backup connection for ${url}: ${error}. Backup is unroutable until fixed.`,
			);
		}
		return null;
	}
	lastDecryptFailureKey = null;

	const instance = createRedisClient({
		cacheUrl: decrypted,
		region: `${currentRegion}:backup`,
		redisType: "misc-secondary",
		cacheCert: null,
	});

	instance.on("error", (error) => {
		logger.error(`[miscRedis] backup=${url}: ${error.message}`);
	});
	instance.on("ready", () => {
		logger.info(`[miscRedis] backup=${url}: connected`);
	});

	cachedBackup = { publicConnectionString, privateConnectionString, instance };
	return instance;
};

const closeMiscBackupClient = () => {
	if (!cachedBackup) return;
	try {
		cachedBackup.instance.disconnect();
	} catch (error) {
		logger.warn(`[miscRedis] failed to disconnect old backup client: ${error}`);
	}
	cachedBackup = null;
};
