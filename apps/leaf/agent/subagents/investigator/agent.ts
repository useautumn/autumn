import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "../../lib/model.js";

export default defineAgent({
	description:
		"Read-only Autumn investigator. Delegate questions about a customer's current state (plans, entities, balances, trials, past-due subscriptions) and what-happened questions answered from request logs. Never use it as a prep step for a billing action — the billing subagent reads any customer state it needs itself.",
	model: leafModel("investigator"),
	modelContextWindowTokens: leafModelContextWindowTokens("investigator"),
	reasoning: leafReasoning("investigator"),
});
