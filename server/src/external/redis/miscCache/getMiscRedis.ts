import type { Redis } from "ioredis";
import { getMiscCache } from "./getMiscCache.js";

/** Active misc-cache Redis, honoring the instance switch in the misc-redis edge config. */
export const getMiscRedis = (): Redis => getMiscCache().getActive();

/** @deprecated Use `getMiscRedis`. Kept for cloud-repo callers. */
export const getPrimaryRedis = getMiscRedis;

/** @deprecated Single-region now — use `getMiscRedis`. Kept for cloud-repo callers. */
export const getRegionalRedis = (_region?: string): Redis => getMiscRedis();
