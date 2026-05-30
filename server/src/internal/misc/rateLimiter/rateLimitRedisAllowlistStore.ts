import { ADMIN_RATE_LIMIT_REDIS_ALLOWLIST_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type RateLimitRedisAllowlistConfig,
	RateLimitRedisAllowlistConfigSchema,
} from "./rateLimitRedisAllowlistSchemas.js";

const defaultConfig = (): RateLimitRedisAllowlistConfig => ({
	customerIds: [],
});

const store = createEdgeConfigStore<RateLimitRedisAllowlistConfig>({
	s3Key: ADMIN_RATE_LIMIT_REDIS_ALLOWLIST_CONFIG_KEY,
	schema: RateLimitRedisAllowlistConfigSchema,
	defaultValue: defaultConfig,
});

registerEdgeConfig({ store });

let cachedConfig: RateLimitRedisAllowlistConfig | null = null;
let cachedCustomerIds = new Set<string>();

const syncCustomerIds = () => {
	const config = store.get();
	if (cachedConfig !== config) {
		cachedConfig = config;
		cachedCustomerIds = new Set(config.customerIds);
	}

	return cachedCustomerIds;
};

const setRuntimeConfig = ({
	config,
}: {
	config: RateLimitRedisAllowlistConfig;
}) => {
	store._setRuntimeConfigForTesting(config);
	cachedConfig = config;
	cachedCustomerIds = new Set(config.customerIds);
};

export const getRuntimeRateLimitRedisAllowlistStatus = () => store.getStatus();

export const getRateLimitRedisAllowlistFromSource = async () =>
	store.readFromSource();

export const isCustomerInRedisAllowlist = ({
	customerId,
}: {
	customerId?: string;
}): boolean => {
	if (!customerId) return false;

	return syncCustomerIds().has(customerId);
};

export const updateFullRateLimitRedisAllowlistConfig = async ({
	config,
}: {
	config: RateLimitRedisAllowlistConfig;
}) => {
	await store.writeToSource({ config });
	cachedConfig = config;
	cachedCustomerIds = new Set(config.customerIds);
};

export const _setRateLimitRedisAllowlistConfigForTesting = ({
	config,
}: {
	config: RateLimitRedisAllowlistConfig;
}) => {
	setRuntimeConfig({ config });
};
