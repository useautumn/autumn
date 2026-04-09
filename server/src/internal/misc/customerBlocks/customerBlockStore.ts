import type { AppEnv } from "@autumn/shared";
import { ADMIN_CUSTOMER_BLOCK_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type CustomerBlockConfig,
	CustomerBlockConfigSchema,
} from "./customerBlockSchemas.js";

const store = createEdgeConfigStore<CustomerBlockConfig>({
	s3Key: ADMIN_CUSTOMER_BLOCK_CONFIG_KEY,
	schema: CustomerBlockConfigSchema,
	defaultValue: () => ({
		orgs: {},
	}),
});

registerEdgeConfig({ store });

export const getRuntimeCustomerBlockStatus = () => store.getStatus();

export const isRuntimeCustomerBlocked = ({
	orgId,
	orgSlug,
	env,
	customerId,
}: {
	orgId: string;
	orgSlug?: string | null;
	env: AppEnv;
	customerId: string;
}) => {
	const orgConfigs = store.get().orgs;

	return Boolean(
		orgConfigs[orgId]?.[env]?.[customerId] ||
			(orgSlug ? orgConfigs[orgSlug]?.[env]?.[customerId] : undefined),
	);
};

export const getCustomerBlockConfigFromSource =
	async (): Promise<CustomerBlockConfig> => {
		return await store.readFromSource();
	};

export const updateFullCustomerBlockConfig = async ({
	config,
}: {
	config: CustomerBlockConfig;
}) => {
	await store.writeToSource({ config });
};
