export type AgentProvisionRateLimitConfig = {
	globalRequestsPerHour: number;
	requestsPerIpPerHour: number;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export type AgentProvisionRateLimitFormValues = Pick<
	AgentProvisionRateLimitConfig,
	"globalRequestsPerHour" | "requestsPerIpPerHour"
>;

export const AGENT_PROVISION_RATE_LIMIT_QUERY_KEY = [
	"admin-edge-config",
	"agent-provision-rate-limit",
] as const;
