import type { Redis } from "ioredis";
import { getMiscCache } from "./getMiscCache.js";

export const getMiscMainRedis = (): Redis => getMiscCache().getMain();

export const getMiscBackupRedis = (): Redis | null =>
	getMiscCache().getBackup();
