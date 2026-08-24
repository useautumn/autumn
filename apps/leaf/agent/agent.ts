import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "./lib/model.js";

const isProduction =
	process.env.NODE_ENV === "production" || process.env.EVE_EMBEDDED === "1";

// A shared Postgres world means this process's queue worker claims and
// EXECUTES that database's workflow jobs — a laptop pointed at prod would run
// prod turns with local code. Outside production the world must be opted into,
// and it always gets its own queue namespace.
const sharedWorldAllowed =
	isProduction || process.env.EVE_ALLOW_SHARED_WORLD === "1";
if (process.env.WORKFLOW_POSTGRES_URL && !sharedWorldAllowed) {
	throw new Error(
		"WORKFLOW_POSTGRES_URL is set outside production. Unset it to use the local world, or set EVE_ALLOW_SHARED_WORLD=1 to knowingly share that database's workflow tables (the queue stays namespaced to this machine).",
	);
}
if (!isProduction && !process.env.WORKFLOW_QUEUE_NAMESPACE) {
	process.env.WORKFLOW_QUEUE_NAMESPACE = `local_${process.env.USER ?? "dev"}`;
}

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
