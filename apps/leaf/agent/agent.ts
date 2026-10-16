import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "./lib/model.js";

const isProduction =
	process.env.NODE_ENV === "production" || process.env.EVE_EMBEDDED === "1";

// The chat database is the durable workflow world; the world package reads
// its own variable, so it is derived here rather than configured separately.
const chatDatabaseUrl = process.env.CHAT_DATABASE_URL;
if (chatDatabaseUrl) process.env.WORKFLOW_POSTGRES_URL = chatDatabaseUrl;
if (!isProduction && !process.env.WORKFLOW_QUEUE_NAMESPACE) {
	process.env.WORKFLOW_QUEUE_NAMESPACE = `local_${process.env.USER ?? "dev"}`;
}

// Self-referenced through package.json exports: eve imports the world from its build dir.
const LEAF_POSTGRES_WORLD = "@autumn/leaf/workflow-world";

const workflowWorld =
	process.env.EVE_WORKFLOW_WORLD ??
	(chatDatabaseUrl ? LEAF_POSTGRES_WORLD : undefined);

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
