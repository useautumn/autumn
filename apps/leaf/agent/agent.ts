import { defineAgent } from "eve";
import { leafModel, leafReasoning } from "./lib/model.js";

const workflowWorld =
	process.env.EVE_WORKFLOW_WORLD ??
	(process.env.WORKFLOW_POSTGRES_URL ? "@workflow/world-postgres" : undefined);

export default defineAgent({
	model: leafModel("orchestrator"),
	// Routing needs no deliberation: "minimal" still emits thinking blocks;
	// "none" disables them entirely.
	reasoning: "none",
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
