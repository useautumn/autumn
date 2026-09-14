import {
	type LeafAgentId,
	leafSkillsFor,
	type Skill,
	skillToText,
} from "@autumn/agent-docs/agent";
import { defineDynamic, defineSkill } from "eve/skills";

/** The agent's skill bundle minus the skills already inlined in its prompt.
 * Every `inlined` name must be in the bundle: an unknown name means the
 * matching `inlinedSkill` is also broken, so fail loudly instead of offering
 * the skill as loadable and pretending it is in the prompt. */
export const loadableSkills = ({
	agent,
	inlined = [],
}: {
	agent: LeafAgentId;
	inlined?: readonly string[];
}): Skill[] => {
	const bundle = leafSkillsFor(agent);
	const bundleNames = new Set(bundle.map((skill) => skill.name));
	for (const name of inlined) {
		if (!bundleNames.has(name)) {
			throw new Error(
				`Inlined skill "${name}" is not in the "${agent}" bundle: ${[...bundleNames].join(", ")}`,
			);
		}
	}
	return bundle.filter((skill) => !inlined.includes(skill.name));
};

/** Loadable skill bundle from agent-docs; a skill named in `inlined` is
 * already in the prompt, so it is not offered as loadable. */
export const agentSkills = ({
	agent,
	inlined = [],
}: {
	agent: LeafAgentId;
	inlined?: readonly string[];
}) => {
	const bundle = loadableSkills({ agent, inlined });
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
