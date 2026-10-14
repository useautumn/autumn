import { leafSkills, type Skill, skillToText } from "@autumn/agent-docs/agent";
import { defineDynamic, defineInstructions } from "eve/instructions";

export const resolveInlinedSkill = ({ name }: { name: string }): Skill => {
	const skill = leafSkills.find((entry) => entry.name === name);
	if (!skill) {
		const known = leafSkills.map((entry) => entry.name).join(", ");
		throw new Error(
			`Cannot inline unknown leaf skill "${name}". Known skills: ${known}`,
		);
	}
	return skill;
};

export const inlinedSkill = ({ name }: { name: string }) => {
	const markdown = skillToText(resolveInlinedSkill({ name }));
	return defineDynamic({
		events: {
			"session.started": () => defineInstructions({ markdown }),
		},
	});
};
