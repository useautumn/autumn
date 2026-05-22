import { getCustomerBucket } from "@/internal/misc/rollouts/rolloutUtils.js";
import { getCacheV2RampConfig } from "./cacheV2RampStore.js";

/** True when the given customer should be routed to the ramp destination. */
export const isCacheV2RampEnabled = ({
	customerId,
}: {
	customerId?: string;
}): boolean => {
	const config = getCacheV2RampConfig();
	if (!config) return false;
	if (config.migrationPercent >= 100) return true;
	if (config.migrationPercent <= 0) return false;
	if (!customerId) return false;
	const bucket = getCustomerBucket({ customerId });
	return bucket < config.migrationPercent;
};

/** True when migrationPercent > 0. Used by invalidation/lock-receipt code that
 *  fans out to BOTH clusters during a ramp, even when it doesn't know the
 *  customer. */
export const isCacheV2RampActive = (): boolean => {
	const config = getCacheV2RampConfig();
	return !!config && config.migrationPercent > 0;
};
