import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "../../lib/model.js";

export default defineAgent({
	description:
		"Read-only Autumn investigator for how or why a customer reached its current state, request-log history, and anomaly diagnosis. Never use it for questions or objections about current or proposed billing, or as preparation for a billing action — the billing specialist owns those.",
	model: leafModel("investigator"),
	modelContextWindowTokens: leafModelContextWindowTokens("investigator"),
	reasoning: leafReasoning("investigator"),
});
