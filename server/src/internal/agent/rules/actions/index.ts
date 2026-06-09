import { generateAndUpdateAgentRules } from "./generateAndUpdateAgentRules.js";
import { updateAgentRules } from "./updateAgentRules.js";

export const agentRulesActions = {
	generateAndUpdate: generateAndUpdateAgentRules,
	update: updateAgentRules,
};
