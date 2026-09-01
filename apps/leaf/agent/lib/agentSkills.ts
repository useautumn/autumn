import {
	type LeafAgentId,
	leafSkillsFor,
	type Skill,
	skillToText,
} from "@autumn/agent-docs/agent";
import { defineDynamic, defineSkill } from "eve/skills";

/** The agent's loadable skill bundle: its own domain skills plus every
 * transitive prerequisite (concepts), resolved from agent-docs. A skill named
 * in `inlined` is already in the prompt, so it is not offered as loadable. */
export const agentSkills = ({
	agent,
	inlined = [],
}: {
	agent: LeafAgentId;
	inlined?: readonly string[];
}) => {
	const bundle: Skill[] = leafSkillsFor(agent).filter(
		(skill) => !inlined.includes(skill.name),
	);
	return defineDynamic({
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
};
