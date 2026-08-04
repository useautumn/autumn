import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";

/** Pinned: Redis is the only store for the device↔org mapping.
 *  1h TTL preserved from the legacy CacheManager default. */
const TRMNL_TTL_SECONDS = 3600;

export type TrmnlDeviceConfig = { orgId: string; hideRevenue: boolean };
export type TrmnlOrgConfig = { deviceId: string; hideRevenue: boolean };

export const buildTrmnlDeviceKey = (deviceId: string) =>
	`trmnl:device:${deviceId}`;

export const buildTrmnlOrgKey = (orgId: string) => `trmnl:org:${orgId}`;

export const getTrmnlDeviceConfig = async ({
	deviceId,
}: {
	deviceId: string;
}): Promise<TrmnlDeviceConfig | null> => {
	const miscRedis = getMiscRedis();
	const deviceKey = buildTrmnlDeviceKey(deviceId);

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(deviceKey),
		source: "trmnl-device-store:get-device",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as TrmnlDeviceConfig;
};

export const setTrmnlDeviceConfig = async ({
	deviceId,
	config,
}: {
	deviceId: string;
	config: TrmnlDeviceConfig;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const deviceKey = buildTrmnlDeviceKey(deviceId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(deviceKey, JSON.stringify(config), "EX", TRMNL_TTL_SECONDS),
		source: "trmnl-device-store:set-device",
		redisInstance: miscRedis,
	});
};

export const deleteTrmnlDeviceConfig = async ({
	deviceId,
}: {
	deviceId: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const deviceKey = buildTrmnlDeviceKey(deviceId);

	await tryRedisOp({
		operation: () => miscRedis.del(deviceKey),
		source: "trmnl-device-store:delete-device",
		redisInstance: miscRedis,
	});
};

export const getTrmnlOrgConfig = async ({
	orgId,
}: {
	orgId: string;
}): Promise<TrmnlOrgConfig | null> => {
	const miscRedis = getMiscRedis();
	const orgKey = buildTrmnlOrgKey(orgId);

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(orgKey),
		source: "trmnl-device-store:get-org",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as TrmnlOrgConfig;
};

export const setTrmnlOrgConfig = async ({
	orgId,
	config,
}: {
	orgId: string;
	config: TrmnlOrgConfig;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const orgKey = buildTrmnlOrgKey(orgId);

	await tryRedisOp({
		operation: () =>
			miscRedis.set(orgKey, JSON.stringify(config), "EX", TRMNL_TTL_SECONDS),
		source: "trmnl-device-store:set-org",
		redisInstance: miscRedis,
	});
};
