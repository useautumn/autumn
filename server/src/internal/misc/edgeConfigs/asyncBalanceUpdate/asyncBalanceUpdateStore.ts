import { ADMIN_ASYNC_BALANCE_UPDATE_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfigs/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfigs/edgeConfigStore.js";
import {
	type AsyncBalanceUpdateConfig,
	AsyncBalanceUpdateConfigSchema,
} from "./asyncBalanceUpdateSchemas.js";

const store = createEdgeConfigStore<AsyncBalanceUpdateConfig>({
	s3Key: ADMIN_ASYNC_BALANCE_UPDATE_CONFIG_KEY,
	schema: AsyncBalanceUpdateConfigSchema,
	defaultValue: () => AsyncBalanceUpdateConfigSchema.parse({}),
});

registerEdgeConfig({ store });

export const isAsyncBalanceUpdateEnabled = ({
	orgId,
	orgSlug,
}: {
	orgId: string;
	orgSlug?: string;
}): boolean => {
	const enabledOrgs = store.get().enabledOrgIds;
	return (
		enabledOrgs.includes(orgId) || (!!orgSlug && enabledOrgs.includes(orgSlug))
	);
};

export const getRuntimeAsyncBalanceUpdateConfigStatus = () => store.getStatus();

export const getAsyncBalanceUpdateConfigFromSource = async () =>
	store.readFromSource();

export const updateFullAsyncBalanceUpdateConfig = async ({
	config,
}: {
	config: AsyncBalanceUpdateConfig;
}) => {
	await store.writeToSource({ config });
};

export const _setAsyncBalanceUpdateConfigForTesting = ({
	config,
}: {
	config: AsyncBalanceUpdateConfig;
}) => {
	store._setRuntimeConfigForTesting(config);
};
