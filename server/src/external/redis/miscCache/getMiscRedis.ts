import type { Redis } from "ioredis";
import type { MiscRedisInstanceName } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigSchemas.js";
import { getActiveMiscRedisInstanceName } from "@/internal/misc/edgeConfigs/miscRedisConfig/miscRedisConfigStore.js";
import { getMiscBackupRedis, getMiscMainRedis } from "./miscRedisInstances.js";

let lastLoggedInstance: MiscRedisInstanceName | null = null;
let warnedUnroutableBackup = false;

/** Active misc-cache Redis, honoring the instance switch in the misc-redis
 *  edge config. */
export const getMiscRedis = (): Redis => {
	const activeInstance = getActiveMiscRedisInstanceName();
	if (activeInstance !== lastLoggedInstance) {
		console.log(`[miscRedis] active instance: ${activeInstance}`);
		lastLoggedInstance = activeInstance;
	}

	if (activeInstance === "backup") {
		const backup = getMiscBackupRedis();
		if (backup) return backup;
		if (!warnedUnroutableBackup) {
			warnedUnroutableBackup = true;
			console.warn(
				"[miscRedis] backup selected but not configured/decryptable; using main",
			);
		}
	}
	return getMiscMainRedis();
};

/** @deprecated Use `getMiscRedis`. Kept for cloud-repo callers. */
export const getPrimaryRedis = getMiscRedis;

/** @deprecated Single-region now — use `getMiscRedis`. Kept for cloud-repo callers. */
export const getRegionalRedis = (_region?: string): Redis => getMiscRedis();
