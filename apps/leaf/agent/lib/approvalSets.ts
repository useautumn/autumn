import { GATED_WRITES } from "./gatedWrites.js";
import type { LeafAgentConnection } from "./toolAllowlists.js";

const setForAgent = (agent: LeafAgentConnection): ReadonlySet<string> =>
	new Set(
		GATED_WRITES.filter((write) =>
			write.agents.some((agentName) => agentName === agent),
		).map((write) => write.toolName),
	);

export const approvalSets: Record<LeafAgentConnection, ReadonlySet<string>> = {
	catalog: setForAgent("catalog"),
	leaf: setForAgent("leaf"),
};

for (const write of GATED_WRITES) {
	// A gated write no agent exposes would silently lose its approval gate.
	if (write.agents.length === 0) {
		throw new Error(`Approval gate lost in the agent split: ${write.toolName}`);
	}
}
