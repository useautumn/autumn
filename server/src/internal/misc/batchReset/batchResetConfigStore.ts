import { ADMIN_BATCH_RESET_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type BatchResetConfig,
	BatchResetConfigSchema,
} from "./batchResetConfigSchemas.js";

const store = createEdgeConfigStore<BatchResetConfig>({
	s3Key: ADMIN_BATCH_RESET_CONFIG_KEY,
	schema: BatchResetConfigSchema,
	defaultValue: () => BatchResetConfigSchema.parse({}),
});

registerEdgeConfig({ store });

export const isBatchResetEnabled = (): boolean => store.get().enabled;

export const getBatchResetConfigStatus = () => store.getStatus();

export const getBatchResetConfigFromSource = async () => store.readFromSource();

export const updateFullBatchResetConfig = async ({
	config,
}: {
	config: BatchResetConfig;
}) => {
	await store.writeToSource({ config });
};

export const _setBatchResetConfigForTesting = ({
	config,
}: {
	config: BatchResetConfig;
}): void => {
	store._setRuntimeConfigForTesting(config);
};
