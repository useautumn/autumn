import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

export default defineAgent({
	description:
		"Read-only Autumn investigator. Delegate questions about a customer's current state (plans, entities, balances, trials, past-due subscriptions) and what-happened questions answered from request logs. Always delegate here before changing a customer whose state is unclear.",
	model: anthropic(process.env.EVE_ANTHROPIC_MODEL ?? "claude-sonnet-5"),
	reasoning: "minimal",
});
