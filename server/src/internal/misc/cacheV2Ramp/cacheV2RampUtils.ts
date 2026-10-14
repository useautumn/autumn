import { getCustomerBucket } from "@/internal/misc/rollouts/rolloutUtils.js";
import { getCacheV2RampConfig } from "./cacheV2RampStore.js";

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

export const isCacheV2RampActive = (): boolean => {
	const config = getCacheV2RampConfig();
	return !!config && config.migrationPercent > 0;
};
