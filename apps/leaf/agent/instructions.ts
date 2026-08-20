import { leafAgentPrompt } from "@autumn/agent-docs/agent";
import { defineInstructions } from "eve/instructions";

export default defineInstructions({
	markdown: [
		leafAgentPrompt("orchestrator"),
		"Autumn knowledge is available through Eve skills. Load the relevant Autumn skill before catalog work.",
	].join("\n\n"),
});
