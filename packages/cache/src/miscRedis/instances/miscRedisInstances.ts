import type { Redis } from "ioredis";
import {
	createConfiguredRedisClient,
	getCacheConfiguration,
} from "../../configureCache.js";
import { getMiscRedisConfig } from "../config/miscRedisConfigStore.js";

let mainClient: Redis | null = null;

export const getMiscMainRedis = (): Redis => {
	if (mainClient) return mainClient;
	const { resolveMainRedisUrl, region } = getCacheConfiguration();
	const cacheUrl = resolveMainRedisUrl();
	if (!cacheUrl) {
		throw new Error(
			"[Redis] misc cache is required — set MISC_CACHE_DRAGONFLY_PUBLIC_URL",
		);
	}
	mainClient = createConfiguredRedisClient({
		cacheUrl,
		region,
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

const closeMiscBackupClient = (): void => {
	if (!cachedBackup) return;
	const { logger } = getCacheConfiguration();
	try {
		cachedBackup.instance.disconnect();
	} catch (error) {
		logger.warn(`[miscRedis] failed to disconnect old backup client: ${error}`);
	}
	cachedBackup = null;
};

export const getMiscBackupRedis = (): Redis | null => {
	const backup = getMiscRedisConfig().backup;
	if (!backup) {
		closeMiscBackupClient();
		return null;
	}

	const { publicConnectionString, privateConnectionString, url } = backup;
	if (
		cachedBackup?.publicConnectionString === publicConnectionString &&
		cachedBackup.privateConnectionString === privateConnectionString
	) {
		return cachedBackup.instance;
	}

	const { logger, resolvePrivateOrPublicUrl, decryptConnectionString, region } =
		getCacheConfiguration();
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
		decrypted = decryptConnectionString(encrypted);
	} catch (error) {
		const failureKey = `${url}|${encrypted}`;
		if (lastDecryptFailureKey !== failureKey) {
			lastDecryptFailureKey = failureKey;
			logger.error(
				`[miscRedis] failed to decrypt backup connection for ${url}: ${error}`,
			);
		}
		return null;
	}
	lastDecryptFailureKey = null;

	const instance = createConfiguredRedisClient({
		cacheUrl: decrypted,
		region: `${region}:backup`,
		redisType: "misc-secondary",
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
