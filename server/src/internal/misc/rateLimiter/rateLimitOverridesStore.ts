import { ADMIN_RATE_LIMIT_OVERRIDES_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type OrgRateLimitOverride,
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

/** An org's overrides, looked up first by orgId, then by orgSlug. */
const findOrgOverride = ({
	orgId,
	orgSlug,
}: {
	orgId?: string;
	orgSlug?: string;
}) => {
	const orgs = store.get().orgs;
	return (
		(orgId ? orgs[orgId] : undefined) ?? (orgSlug ? orgs[orgSlug] : undefined)
	);
};

/** The override limit for an org+type, or undefined if none is configured. */
export const getOrgRateLimitOverride = ({
	orgId,
	orgSlug,
	type,
}: {
	orgId?: string;
	orgSlug?: string;
	type: string;
}): number | undefined => findOrgOverride({ orgId, orgSlug })?.limits?.[type];

export const getOrgEndpointRateLimitOverrides = ({
	orgId,
	orgSlug,
}: {
	orgId?: string;
	orgSlug?: string;
}): OrgRateLimitOverride["endpoints"] =>
	findOrgOverride({ orgId, orgSlug })?.endpoints;

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
