import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "./lib/model.js";

const isProduction =
	process.env.NODE_ENV === "production" || process.env.EVE_EMBEDDED === "1";

// A shared world's queue worker EXECUTES that database's jobs: a laptop
// pointed at prod would run prod turns with local code.
const sharedWorldAllowed =
	isProduction || process.env.EVE_ALLOW_SHARED_WORLD === "1";
const chatDatabaseUrl = sharedWorldAllowed
	? process.env.CHAT_DATABASE_URL
	: undefined;
// The world package reads its own variable, derived here so nothing else
// configures a second URL.
if (chatDatabaseUrl) process.env.WORKFLOW_POSTGRES_URL = chatDatabaseUrl;
else delete process.env.WORKFLOW_POSTGRES_URL;
if (!isProduction && !process.env.WORKFLOW_QUEUE_NAMESPACE) {
	process.env.WORKFLOW_QUEUE_NAMESPACE = `local_${process.env.USER ?? "dev"}`;
}

const workflowWorld =
	process.env.EVE_WORKFLOW_WORLD ??
	(chatDatabaseUrl ? "@workflow/world-postgres" : undefined);

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
