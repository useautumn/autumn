import { findSkill, skillBundleFor } from "@autumn/agent-docs/skills";
import type { AgentKit } from "./types/agentKit.ts";

/** The pack a real onboarding installs: autumn-setup plus everything it requires. */
export const defaultKit = (): AgentKit => ({
	skills: skillBundleFor({ name: "autumn-setup" }),
	underTest: "autumn-setup",
});

/** Nothing installed — the control arm. */
export const bareKit = (): AgentKit => ({ skills: [] });

/** Exactly the named agent-docs skills — no automatic requires expansion. */
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

/** The skill this kit is testing: the declared one, or the first installed. */
export const kitUnderTest = (kit: AgentKit): string | undefined =>
	kit.underTest ?? kit.skills[0]?.name;
