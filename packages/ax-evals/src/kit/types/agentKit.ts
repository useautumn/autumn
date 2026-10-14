import type { Skill } from "@autumn/agent-docs/skills";

export type AgentKit = {
	skills: Skill[];
	underTest?: string;
};
