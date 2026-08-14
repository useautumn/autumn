import type { Redis } from "ioredis";
import { resolvePrivateOrPublicUrl } from "@/external/aws/ecs/resolvePrivateOrPublicUrl.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedisConfig } from "@/internal/misc/miscRedisConfig/miscRedisConfigStore.js";
import { decryptData } from "@/utils/encryptUtils.js";
import { createRedisClient } from "../initUtils/createRedisClient.js";
import { currentRegion, resolveMiscMainUrl } from "../initUtils/redisConfig.js";

let mainClient: Redis | null = null;

/** The "main" misc-cache instance: env-configured (MISC_CACHE_DRAGONFLY_*),
 *  created on first use. Lazy on purpose — env may be injected after import
 *  (infisical); calls retry until the env lands. */
export const getMiscMainRedis = (): Redis => {
	if (mainClient) return mainClient;

	const cacheUrl = resolveMiscMainUrl();
	if (!cacheUrl) {
		throw new Error(
			"[Redis] misc cache is required — set MISC_CACHE_DRAGONFLY_PUBLIC_URL",
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
let loggedHeadlessBackupSkip = false;

const isHeadlessDw = (): boolean => {
	const flag = process.env.DW_HEADLESS;
	return flag === "1" || flag === "true";
};

/** The "backup" misc-cache instance, from the misc-redis edge config.
 *  Lazy + hot-swappable: a changed or rotated connection disconnects the old
 *  client on the next call. ECS prefers the private endpoint when set;
 *  everything else uses the public one. Null while no backup is configured.
 *  Cursor Cloud (`DW_HEADLESS`) must not open the team Dragonfly backup. */
export const getMiscBackupRedis = (): Redis | null => {
	if (isHeadlessDw()) {
		closeMiscBackupClient();
		if (!loggedHeadlessBackupSkip) {
			loggedHeadlessBackupSkip = true;
			logger.info(
				"[miscRedis] DW_HEADLESS=1 — skipping edge-config backup Redis",
			);
		}
		return null;
	}

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
