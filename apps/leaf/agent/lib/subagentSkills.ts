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
 * prerequisite (concepts), resolved from agent-docs. A skill named in
 * `inlined` is already in the prompt, so it is not offered as loadable. */
export const subagentSkills = ({
	agent,
	inlined = [],
}: {
	agent: LeafAgentId;
	inlined?: readonly string[];
}) =>
	skillBundle(
		leafSkillsFor(agent).filter((skill) => !inlined.includes(skill.name)),
	);

export const namedSkills = ({ names }: { names: readonly string[] }) =>
	skillBundle(leafSkills.filter((skill) => names.includes(skill.name)));
