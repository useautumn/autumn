import { ADMIN_RESET_JOB_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type ResetJobConfig,
	ResetJobConfigSchema,
} from "./resetJobSchemas.js";

const store = createEdgeConfigStore<ResetJobConfig>({
	s3Key: ADMIN_RESET_JOB_CONFIG_KEY,
	schema: ResetJobConfigSchema,
	defaultValue: () => ResetJobConfigSchema.parse({}),
});

registerEdgeConfig({ store });

export const getResetJobConfig = () => store.get();

export const isResetJobEnabled = () => getResetJobConfig().enabled;

export const getResetJobConfigStatus = () => store.getStatus();

export const getResetJobConfigFromSource = async () => store.readFromSource();

export const updateResetJobConfig = async ({
	config,
}: {
	config: ResetJobConfig;
}) => store.writeToSource({ config });

export const setResetJobConfigForTesting = ({
	config,
}: {
	config: ResetJobConfig;
}) => store._setRuntimeConfigForTesting(config);
