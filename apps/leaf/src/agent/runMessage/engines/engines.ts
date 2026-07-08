import { eveEngine } from "../../../harness/eve/engine.js";
import type { AgentHarnessName } from "../../../lib/chatAgentConfig.js";
import type { AgentEngine } from "../types.js";
import { claudeManagedEngine } from "./claudeManagedEngine.js";
import { mastraEngine } from "./mastraEngine.js";

export const agentEngines: Record<AgentHarnessName, AgentEngine> = {
	"claude-managed": claudeManagedEngine,
	eve: eveEngine,
	mastra: mastraEngine,
};
