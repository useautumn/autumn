import type { MiscCache } from "@autumn/cache";
import { getMiscCache } from "./getMiscCache.js";

export const setOnMiscRedisTargets = (
	params: Parameters<MiscCache["setOnTargets"]>[0],
): Promise<void> => getMiscCache().setOnTargets(params);

export const mirrorSetOnMiscRedisRampTarget = (
	params: Parameters<MiscCache["mirrorSetOnRampTarget"]>[0],
): Promise<void> => getMiscCache().mirrorSetOnRampTarget(params);
