import type { Skill } from "@autumn/agent-docs/skills";

/**
 * Everything the agent session gets for one eval arm. Skills only today; MCP
 * servers and other equipment join here as the harness grows.
 */
export type AgentKit = {
	/** Installed into the workspace plugin, in order — corpus skills or inline ones (e.g. noise). */
	skills: Skill[];
	/** Name of the skill `conduct.skillFired` asserts on; defaults to the first skill. */
	underTest?: string;
};
