import { ADMIN_AGENT_PROVISION_RATE_LIMIT_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type AgentProvisionRateLimitConfig,
	AgentProvisionRateLimitConfigSchema,
} from "./agentProvisionRateLimitSchemas.js";

const store = createEdgeConfigStore<AgentProvisionRateLimitConfig>({
	s3Key: ADMIN_AGENT_PROVISION_RATE_LIMIT_CONFIG_KEY,
	schema: AgentProvisionRateLimitConfigSchema,
	defaultValue: () => ({}),
});

registerEdgeConfig({ store });

export const getRuntimeAgentProvisionRateLimitStatus = () => store.getStatus();

export const getRuntimeAgentProvisionRateLimit = () => store.get();

export const getAgentProvisionRateLimitFromSource = async () =>
	store.readFromSource();

export const updateAgentProvisionRateLimit = async ({
	config,
}: {
	config: AgentProvisionRateLimitConfig;
}) => {
	await store.writeToSource({ config });
};

export const _setAgentProvisionRateLimitForTesting = ({
	config,
}: {
	config: AgentProvisionRateLimitConfig;
}) => {
	store._setRuntimeConfigForTesting(config);
};
