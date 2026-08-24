import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "../../lib/model.js";

export default defineAgent({
	description:
		"Autumn billing specialist. Delegate every billing action straight here, with no investigator pre-check — it reads the customer state it needs itself: attaching plans, updating subscriptions (quantities, cancels, custom terms), creating schedules, and balance grants. Pack the full task into the message — customer and plan ids, quantities, customize terms, timing, invoice settings, and any findings already gathered.",
	model: leafModel("billing"),
	modelContextWindowTokens: leafModelContextWindowTokens("billing"),
	reasoning: leafReasoning("billing"),
});
