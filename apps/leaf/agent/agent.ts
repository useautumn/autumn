import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "./lib/model.js";

const isProduction =
	process.env.NODE_ENV === "production" || process.env.EVE_EMBEDDED === "1";

const chatDatabaseUrl = process.env.CHAT_DATABASE_URL;
if (chatDatabaseUrl) process.env.WORKFLOW_POSTGRES_URL = chatDatabaseUrl;
if (!isProduction && !process.env.WORKFLOW_QUEUE_NAMESPACE) {
	process.env.WORKFLOW_QUEUE_NAMESPACE = `local_${process.env.USER ?? "dev"}`;
}

const workflowWorld =
	process.env.EVE_WORKFLOW_WORLD ??
	(chatDatabaseUrl ? "@workflow/world-postgres" : undefined);

export default defineAgent({
	build: { externalDependencies: ["@vercel/otel"] },
	model: leafModel("leaf"),
	modelContextWindowTokens: leafModelContextWindowTokens("leaf"),
	reasoning: leafReasoning("leaf"),
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
