import { applyDbCapacityConfig } from "@/db/dbPoolCapacity.js";
import { ADMIN_DB_CAPACITY_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type DbCapacityConfig,
	DbCapacityConfigSchema,
	getDefaultDbCapacityConfig,
} from "./dbCapacityConfigSchemas.js";

const store = createEdgeConfigStore<DbCapacityConfig>({
	s3Key: ADMIN_DB_CAPACITY_CONFIG_KEY,
	schema: DbCapacityConfigSchema,
	defaultValue: () =>
		getDefaultDbCapacityConfig({
			isProduction: process.env.NODE_ENV === "production",
		}),
	retainOnError: true,
	onConfigChange: (config) => {
		applyDbCapacityConfig({ config });
	},
});

registerEdgeConfig({ store });

export const getRuntimeDbCapacityConfigStatus = () => store.getStatus();

export const getRuntimeDbCapacityConfig = (): DbCapacityConfig => store.get();

export const getDbCapacityConfigFromSource =
	async (): Promise<DbCapacityConfig> => store.readFromSource();

export const updateDbCapacityConfig = async ({
	config,
}: {
	config: DbCapacityConfig;
}): Promise<void> => {
	await store.writeToSource({ config });
};

export const _setDbCapacityConfigForTesting = ({
	config,
}: {
	config: DbCapacityConfig;
}): void => {
	store._setRuntimeConfigForTesting(config);
};
