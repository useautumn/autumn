import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { createPublicRedisRateLimiter } from "@/internal/misc/rateLimiter/public/createPublicRedisRateLimiter.js";
import { PublicRateLimitType } from "@/internal/misc/rateLimiter/public/publicRateLimitConfigs.js";
import { handleClaimAgentOrg } from "./handlers/handleClaimAgentOrg.js";
import { handleCompleteAgentClaim } from "./handlers/handleCompleteAgentClaim.js";
import { handleGetAgentClaimAttempt } from "./handlers/handleGetAgentClaimAttempt.js";
import { handleProvisionAgentOrg } from "./handlers/handleProvisionAgentOrg.js";

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
	"/agent.start_claim",
	limiter(PublicRateLimitType.AgentClaim),
	...handleClaimAgentOrg,
);
agentOnboardingRouter.get(
	"/agent.preview_claim",
	limiter(PublicRateLimitType.AgentClaimInspect),
	...handleGetAgentClaimAttempt,
);
agentOnboardingRouter.post(
	"/agent.complete_claim",
	limiter(PublicRateLimitType.AgentClaimComplete),
	...handleCompleteAgentClaim,
);
