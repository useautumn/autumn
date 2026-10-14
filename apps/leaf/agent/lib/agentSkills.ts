import {
	type LeafAgentId,
	leafSkillsFor,
	type Skill,
	skillToText,
} from "@autumn/agent-docs/agent";
import { defineDynamic, defineSkill } from "eve/skills";

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
