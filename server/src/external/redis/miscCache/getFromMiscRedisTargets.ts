import type { MiscCache } from "@autumn/cache";
import { getMiscCache } from "./getMiscCache.js";

export const getFromMiscRedisTargets = (
	params: Parameters<MiscCache["getFromTargets"]>[0],
): Promise<string | null> => getMiscCache().getFromTargets(params);
