import type { CacheLogger } from "../../client/types/redisClient.js";
import type { MiscCache } from "../../misc/types/miscCache.js";

/** Suppression keys are cross-request state, so they pin to the active instance. */
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
