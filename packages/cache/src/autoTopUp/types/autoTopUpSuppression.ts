import type { CacheLogger } from "../../client/types/redisClient.js";
import type { MiscCache } from "../../misc/types/miscCache.js";

export type AutoTopUpSuppressionContext = {
	miscCache: Pick<MiscCache, "getActive">;
	logger: CacheLogger;
};

export type AutoTopUpPendingKeyParams = {
	orgId: string;
	env: string;
	customerId: string;
	featureId: string;
};

export type AutoTopUpPendingClaim =
	| "claimed"
	| "pending_exists"
	| "unavailable";
