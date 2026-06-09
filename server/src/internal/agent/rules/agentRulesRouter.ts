import { Hono } from "hono";
import { createRouterRateLimiter } from "@/honoMiddlewares/routerRateLimiter/index.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGenerateAgentRules } from "./handlers/handleGenerateAgentRules.js";
import { handleGetAgentRules } from "./handlers/handleGetAgentRules.js";
import { handleUpdateAgentRules } from "./handlers/handleUpdateAgentRules.js";

export const agentRulesRpcRouter = new Hono<HonoEnv>();
const generateAgentRulesLimiter = createRouterRateLimiter({
	keyPrefix: "agent_rules_generate",
	limit: 1,
	windowMs: 1000,
});

agentRulesRpcRouter.post("/agent.get_rules", ...handleGetAgentRules);
agentRulesRpcRouter.post("/agent.update_rules", ...handleUpdateAgentRules);

agentRulesRpcRouter.post(
	"/agent.generate_rules",
	generateAgentRulesLimiter,
	...handleGenerateAgentRules,
);
