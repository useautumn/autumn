import { leafAgentPrompt } from "@autumn/agent-docs/agent";
import { defineInstructions } from "eve/instructions";

export default defineInstructions({
	markdown: [
		leafAgentPrompt("orchestrator"),
		"Autumn knowledge is available through Eve skills. Load the autumn-concepts skill only when the user asks a conceptual pricing-model question you cannot answer from the preloaded context.",
	].join("\n\n"),
});
