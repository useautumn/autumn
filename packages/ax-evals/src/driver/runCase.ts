import { AGENT_HARNESS } from "../axConstants.ts";
import { runAgentCase } from "./runAgentCase.ts";
import { runCodexCase } from "./runCodexCase.ts";

/** One entry point per case: the AGENT knob picks which agent CLI runs it. */
export const runCase: typeof runAgentCase = (params) =>
	AGENT_HARNESS === "codex" ? runCodexCase(params) : runAgentCase(params);
