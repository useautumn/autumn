import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "../../lib/model.js";

export default defineAgent({
	description:
		"Read-only Autumn investigator. Delegate questions about a customer's current state (plans, entities, balances, trials, past-due subscriptions) and what-happened questions answered from request logs. Always delegate here before changing a customer whose state is unclear.",
	model: leafModel("investigator"),
	modelContextWindowTokens: leafModelContextWindowTokens("investigator"),
	reasoning: leafReasoning("investigator"),
});
