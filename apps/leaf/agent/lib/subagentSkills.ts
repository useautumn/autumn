import {
	type LeafAgentId,
	leafSkills,
	leafSkillsFor,
	type Skill,
	skillToText,
} from "@autumn/agent-docs/agent";
import { defineDynamic, defineSkill } from "eve/skills";

const skillBundle = (bundle: Skill[]) =>
	defineDynamic({
		events: {
			"session.started": () =>
				Object.fromEntries(
					bundle.map((skill) => [
						skill.name,
						defineSkill({
							description: skill.description,
							markdown: skillToText(skill),
						}),
					]),
				),
		},
	});

/** The subagent's skill bundle: its own domain skill plus every transitive
 * prerequisite (concepts), resolved from agent-docs. */
export const subagentSkills = ({ agent }: { agent: LeafAgentId }) =>
	skillBundle(leafSkillsFor(agent));

export const namedSkills = ({ names }: { names: readonly string[] }) =>
	skillBundle(leafSkills.filter((skill) => names.includes(skill.name)));
