import { ADMIN_FULL_SUBJECT_GATE_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type FullSubjectGateEdgeConfig,
	FullSubjectGateEdgeConfigSchema,
} from "./fullSubjectGateEdgeConfigSchemas.js";

const store = createEdgeConfigStore<FullSubjectGateEdgeConfig>({
	s3Key: ADMIN_FULL_SUBJECT_GATE_CONFIG_KEY,
	schema: FullSubjectGateEdgeConfigSchema,
	defaultValue: () => FullSubjectGateEdgeConfigSchema.parse({}),
});

registerEdgeConfig({ store });

export const getRuntimeFullSubjectGateConfigStatus = () => store.getStatus();

export const getRuntimeFullSubjectGateConfig = (): FullSubjectGateEdgeConfig =>
	store.get();

export const getFullSubjectGateConfigFromSource =
	async (): Promise<FullSubjectGateEdgeConfig> => store.readFromSource();

export const updateFullSubjectGateConfig = async ({
	config,
}: {
	config: FullSubjectGateEdgeConfig;
}): Promise<void> => {
	await store.writeToSource({ config });
};

export const _setFullSubjectGateConfigForTesting = ({
	config,
}: {
	config: FullSubjectGateEdgeConfig;
}): void => {
	store._setRuntimeConfigForTesting(config);
};
