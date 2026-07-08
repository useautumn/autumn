import { anthropic } from "@ai-sdk/anthropic";
import { defineAgent } from "eve";

const model =
	process.env.EVE_MODEL ??
	anthropic(process.env.EVE_ANTHROPIC_MODEL ?? "claude-sonnet-5");

const workflowWorld =
	process.env.EVE_WORKFLOW_WORLD ??
	(process.env.WORKFLOW_POSTGRES_URL ? "@workflow/world-postgres" : undefined);

export default defineAgent({
	model,
	reasoning: "minimal",
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
