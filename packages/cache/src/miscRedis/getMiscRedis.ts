import type { Redis } from "ioredis";
import { getActiveMiscRedisInstanceName } from "./config/miscRedisConfigStore.js";
import {
	getMiscBackupRedis,
	getMiscMainRedis,
} from "./instances/miscRedisInstances.js";

let lastLoggedInstance: string | null = null;
let warnedUnroutableBackup = false;

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

export const getPrimaryRedis = getMiscRedis;

export const getRegionalRedis = (_region?: string): Redis => getMiscRedis();
