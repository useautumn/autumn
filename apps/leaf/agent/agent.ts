import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "./lib/model.js";

const workflowWorld =
	process.env.EVE_WORKFLOW_WORLD ??
	(process.env.WORKFLOW_POSTGRES_URL ? "@workflow/world-postgres" : undefined);

export default defineAgent({
	model: leafModel("orchestrator"),
	modelContextWindowTokens: leafModelContextWindowTokens("orchestrator"),
	reasoning: leafReasoning("orchestrator"),
	...(workflowWorld
		? {
				experimental: {
					workflow: {
						world: workflowWorld,
					},
				},
			}
		: {}),
});
