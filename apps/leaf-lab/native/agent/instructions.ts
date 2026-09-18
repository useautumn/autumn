import { leafAgentPrompt } from "@autumn/agent-docs/agent";
import { defineInstructions } from "eve/instructions";

export default defineInstructions({ content: leafAgentPrompt("leaf") });
