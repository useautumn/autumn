import {
	type LeafAgentId,
	leafSkillsFor,
	skillToText,
} from "@autumn/agent-docs/agent";
import { defineDynamic, defineSkill } from "eve/skills";

/** The subagent's skill bundle: its own domain skill plus every transitive
 * prerequisite (concepts), resolved from agent-docs. */
export const subagentSkills = ({ agent }: { agent: LeafAgentId }) =>
	defineDynamic({
		events: {
			"session.started": () =>
				Object.fromEntries(
					leafSkillsFor(agent).map((skill) => [
						skill.name,
						defineSkill({
							description: skill.description,
							markdown: skillToText(skill),
						}),
					]),
				),
		},
	});
