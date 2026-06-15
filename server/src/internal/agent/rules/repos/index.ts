import { getAgentRules } from "./getAgentRules.js";
import { upsertAgentRules } from "./upsertAgentRules.js";

export const agentRulesRepo = {
	get: getAgentRules,
	upsert: upsertAgentRules,
};
