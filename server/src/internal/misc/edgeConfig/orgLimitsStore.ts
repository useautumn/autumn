import { ADMIN_ORG_LIMITS_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type OrgLimitsConfig,
	OrgLimitsConfigSchema,
} from "./orgLimitsSchemas.js";

export const DEFAULT_CUS_PRODUCT_LIMIT = 15;

const store = createEdgeConfigStore<OrgLimitsConfig>({
	s3Key: ADMIN_ORG_LIMITS_CONFIG_KEY,
	schema: OrgLimitsConfigSchema,
	defaultValue: () => ({ orgs: {} }),
	pollIntervalMs: 30_000,
});

registerEdgeConfig({ store });

export const getRuntimeOrgLimitsStatus = () => store.getStatus();

export const getOrgCusProductLimit = ({
	orgId,
	orgSlug,
}: {
	orgId?: string;
	orgSlug?: string;
}): number => {
	const orgs = store.get().orgs;
	const orgConfig =
		(orgId ? orgs[orgId] : undefined) ??
		(orgSlug ? orgs[orgSlug] : undefined);
	return orgConfig?.maxCusProducts ?? DEFAULT_CUS_PRODUCT_LIMIT;
};

export const getOrgLimitsConfigFromSource = async () => {
	return await store.readFromSource();
};

export const updateOrgLimitsInSource = async ({
	orgId,
	maxCusProducts,
}: {
	orgId: string;
	maxCusProducts?: number;
}) => {
	const config = await store.readFromSource();

	if (maxCusProducts === undefined) {
		delete config.orgs[orgId];
	} else {
		config.orgs[orgId] = { maxCusProducts };
	}

	await store.writeToSource({ config });
	return config.orgs[orgId];
};

export const updateFullOrgLimitsConfig = async ({
	config,
}: {
	config: OrgLimitsConfig;
}) => {
	await store.writeToSource({ config });
};
