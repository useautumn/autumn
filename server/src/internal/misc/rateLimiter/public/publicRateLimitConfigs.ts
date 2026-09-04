export enum PublicRateLimitType {
	AgentProvisionGlobal = "agent_provision_global",
	AgentProvisionClient = "agent_provision_client",
	AgentClaim = "agent_claim",
	AgentVerify = "agent_verify",
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
	[PublicRateLimitType.AgentVerify]: {
		name: "agent-verify",
		limit: process.env.NODE_ENV === "development" ? DEVELOPMENT_LIMIT : 30,
		windowMs: 15 * MINUTE_MS,
		scope: PublicRateLimitScope.Client,
	},
};
