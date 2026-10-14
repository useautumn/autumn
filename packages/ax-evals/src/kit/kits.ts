import { findSkill, skillBundleFor } from "@autumn/agent-docs/skills";
import type { AgentKit } from "./types/agentKit.ts";

export const defaultKit = (): AgentKit => ({
	skills: skillBundleFor({ name: "autumn-setup" }),
	underTest: "autumn-setup",
});

export const bareKit = (): AgentKit => ({ skills: [] });

export const integrateKit = (): AgentKit => ({
	skills: skillBundleFor({ name: "autumn-integrate" }),
	underTest: "autumn-integrate",
});

export const agentDocsKit = ({
	skillNames,
	underTest,
}: {
	skillNames: string[];
	underTest?: string;
}): AgentKit => ({
	skills: skillNames.map((name) => findSkill(name)),
	underTest,
});

export const kitUnderTest = (kit: AgentKit): string | undefined =>
	kit.underTest ?? kit.skills[0]?.name;
