import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "../../lib/model.js";

export default defineAgent({
	description:
		"Autumn billing specialist for billing actions and text-only questions or objections about current or proposed billing. Delegate straight here, with no investigator pre-check — it reads the customer state it needs itself. Pack the full task into the message, including customer and plan ids, quantities, custom terms, timing, invoice settings, and findings already gathered.",
	model: leafModel("billing"),
	modelContextWindowTokens: leafModelContextWindowTokens("billing"),
	reasoning: leafReasoning("billing"),
});
