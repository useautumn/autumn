import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { createPublicRedisRateLimiter } from "@/internal/misc/rateLimiter/public/createPublicRedisRateLimiter.js";
import { PublicRateLimitType } from "@/internal/misc/rateLimiter/public/publicRateLimitConfigs.js";
import { handleClaimAgentOrg } from "./handlers/handleClaimAgentOrg.js";
import { handleProvisionAgentOrg } from "./handlers/handleProvisionAgentOrg.js";
import { handleVerifyAgent } from "./handlers/handleVerifyAgent.js";

const limiter = (type: PublicRateLimitType) =>
	createPublicRedisRateLimiter({ type });

export const agentOnboardingRouter = new Hono<HonoEnv>();

agentOnboardingRouter.post(
	"/agent.provision",
	limiter(PublicRateLimitType.AgentProvisionGlobal),
	limiter(PublicRateLimitType.AgentProvisionClient),
	...handleProvisionAgentOrg,
);
agentOnboardingRouter.post(
	"/agent.claim",
	limiter(PublicRateLimitType.AgentClaim),
	...handleClaimAgentOrg,
);
agentOnboardingRouter.post(
	"/agent.verify",
	limiter(PublicRateLimitType.AgentVerify),
	...handleVerifyAgent,
);
