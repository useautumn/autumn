import { defineAgent } from "eve";
import {
	leafModel,
	leafModelContextWindowTokens,
	leafReasoning,
} from "./lib/model.js";

const isProduction =
	process.env.NODE_ENV === "production" || process.env.EVE_EMBEDDED === "1";

if (!isProduction && !process.env.WORKFLOW_QUEUE_NAMESPACE) {
	process.env.WORKFLOW_QUEUE_NAMESPACE = `local_${process.env.USER ?? "dev"}`;
}

export default defineAgent({
	build: { externalDependencies: ["@vercel/otel"] },
	model: leafModel("leaf"),
	modelContextWindowTokens: leafModelContextWindowTokens("leaf"),
	reasoning: leafReasoning("leaf"),
});
