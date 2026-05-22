import { ADMIN_RATE_LIMIT_OVERRIDES_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import type { RateLimitType } from "./rateLimitConfigs.js";
import {
	type RateLimitOverridesConfig,
	RateLimitOverridesConfigSchema,
} from "./rateLimitOverridesSchemas.js";

const store = createEdgeConfigStore<RateLimitOverridesConfig>({
	s3Key: ADMIN_RATE_LIMIT_OVERRIDES_CONFIG_KEY,
	schema: RateLimitOverridesConfigSchema,
	defaultValue: () => ({ orgs: {} }),
});

registerEdgeConfig({ store });

export const getRuntimeRateLimitOverridesStatus = () => store.getStatus();

export const getRateLimitOverridesFromSource = async () =>
	store.readFromSource();

/**
 * Returns the override limit for an org+type, or undefined if no override
 * is configured. Looked up first by orgId, then by orgSlug.
 */
export const getOrgRateLimitOverride = ({
	orgId,
	orgSlug,
	type,
}: {
	orgId?: string;
	orgSlug?: string;
	type: RateLimitType;
}): number | undefined => {
	const orgs = store.get().orgs;
	const orgConfig =
		(orgId ? orgs[orgId] : undefined) ?? (orgSlug ? orgs[orgSlug] : undefined);
	return orgConfig?.limits?.[type];
};

export const updateFullRateLimitOverridesConfig = async ({
	config,
}: {
	config: RateLimitOverridesConfig;
}) => {
	await store.writeToSource({ config });
};

/**
 * Test-only helper: override the in-memory rate limit overrides config without
 * touching S3.
 */
export const _setRateLimitOverridesConfigForTesting = ({
	config,
}: {
	config: RateLimitOverridesConfig;
}) => {
	store._setRuntimeConfigForTesting(config);
};
