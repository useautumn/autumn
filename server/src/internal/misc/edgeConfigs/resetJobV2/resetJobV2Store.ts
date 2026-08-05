import { ADMIN_RESET_JOB_V2_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfigs/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfigs/edgeConfigStore.js";
import {
	type ResetJobV2Config,
	ResetJobV2ConfigSchema,
} from "./resetJobV2Schemas.js";

const store = createEdgeConfigStore<ResetJobV2Config>({
	s3Key: ADMIN_RESET_JOB_V2_CONFIG_KEY,
	schema: ResetJobV2ConfigSchema,
	defaultValue: () => ResetJobV2ConfigSchema.parse({}),
});

registerEdgeConfig({ store });

export const getResetJobV2Config = () => store.get();

export const isResetJobV2Enabled = () => getResetJobV2Config().enabled;

export const getResetJobV2ConfigStatus = () => store.getStatus();

export const getResetJobV2ConfigFromSource = async () => store.readFromSource();

export const updateResetJobV2Config = async ({
	config,
}: {
	config: ResetJobV2Config;
}) => store.writeToSource({ config });

export const setResetJobV2ConfigForTesting = ({
	config,
}: {
	config: ResetJobV2Config;
}) => store._setRuntimeConfigForTesting(config);
