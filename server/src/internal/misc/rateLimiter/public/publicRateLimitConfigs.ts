import { getRuntimeAgentProvisionRateLimit } from "./agentProvisionRateLimit/agentProvisionRateLimitStore.js";

export enum PublicRateLimitType {
	AgentProvisionGlobal = "agent_provision_global",
	AgentProvisionClient = "agent_provision_client",
	AgentClaim = "agent_claim",
	AgentClaimInspect = "agent_claim_inspect",
	AgentClaimComplete = "agent_claim_complete",
}

export enum PublicRateLimitScope {
	Global = "global",
	Client = "client",
}

export type PublicRateLimitConfig = {
	name: string;
	limit: number;
	windowMs: number;
	scope: PublicRateLimitScope;
};

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEVELOPMENT_LIMIT = 1000;

export const PUBLIC_RATE_LIMIT_CONFIGS: Record<
	PublicRateLimitType,
	PublicRateLimitConfig
> = {
	[PublicRateLimitType.AgentProvisionGlobal]: {
		name: "agent-provision",
		limit: process.env.NODE_ENV === "development" ? DEVELOPMENT_LIMIT : 100,
		windowMs: HOUR_MS,
		scope: PublicRateLimitScope.Global,
	},
	[PublicRateLimitType.AgentProvisionClient]: {
		name: "agent-provision",
		limit: process.env.NODE_ENV === "development" ? DEVELOPMENT_LIMIT : 5,
		windowMs: HOUR_MS,
		scope: PublicRateLimitScope.Client,
	},
	[PublicRateLimitType.AgentClaim]: {
		name: "agent-claim",
		limit: process.env.NODE_ENV === "development" ? DEVELOPMENT_LIMIT : 10,
		windowMs: HOUR_MS,
		scope: PublicRateLimitScope.Client,
	},
	[PublicRateLimitType.AgentClaimInspect]: {
		name: "agent-claim-inspect",
		limit: process.env.NODE_ENV === "development" ? DEVELOPMENT_LIMIT : 30,
		windowMs: 15 * MINUTE_MS,
		scope: PublicRateLimitScope.Client,
	},
	[PublicRateLimitType.AgentClaimComplete]: {
		name: "agent-claim-complete",
		limit: process.env.NODE_ENV === "development" ? DEVELOPMENT_LIMIT : 30,
		windowMs: 15 * MINUTE_MS,
		scope: PublicRateLimitScope.Client,
	},
};

export const resolvePublicRateLimit = ({
	type,
}: {
	type: PublicRateLimitType;
}): PublicRateLimitConfig => {
	const config = PUBLIC_RATE_LIMIT_CONFIGS[type];
	const agentProvisionRateLimit = getRuntimeAgentProvisionRateLimit();

	switch (type) {
		case PublicRateLimitType.AgentProvisionGlobal:
			return {
				...config,
				limit: agentProvisionRateLimit.globalRequestsPerHour ?? config.limit,
			};
		case PublicRateLimitType.AgentProvisionClient:
			return {
				...config,
				limit: agentProvisionRateLimit.requestsPerIpPerHour ?? config.limit,
			};
		default:
			return config;
	}
};
