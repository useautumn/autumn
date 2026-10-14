import type { ComposedSkill } from "../composeSkill.js";
import type { Skill } from "./types.js";

export const toSkill = ({ skill }: { skill: ComposedSkill }): Skill => {
	const frontmatter = [
		"---",
		`name: ${skill.name}`,
		`description: ${skill.description}`,
		"---",
	].join("\n");

	return {
		name: skill.name,
		description: skill.description,
		markdown: [frontmatter, skill.body].join("\n\n"),
		references: skill.references,
		requires: skill.requires,
	};
};
