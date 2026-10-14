import {
	leafAgentPrompts,
	leafAgentSkillNames,
} from "../generated/agent-prompts.generated.js";
import { autumnMcpInstructions } from "../generated/instructions.generated.js";
import { leafPrompts } from "../generated/leaf-prompts.generated.js";
import { skills } from "../generated/skills.generated.js";
import type { Skill } from "../translate/formats/types.js";
import { expandRequires, findSkill } from "./skills.js";

export { autumnMcpInstructions };
export type { Skill };

export type LeafSurface = keyof typeof leafPrompts;

export const leafSystemPrompt = (surface: LeafSurface): string =>
	leafPrompts[surface];

export const leafSkills: Skill[] = skills;

export type LeafAgentId = keyof typeof leafAgentPrompts;

export const leafAgentPrompt = (id: LeafAgentId): string =>
	leafAgentPrompts[id];

export const leafSkillBundle = (skillNames: readonly string[]): Skill[] =>
	expandRequires([...skillNames]).map(findSkill);

export const leafSkillsFor = (id: LeafAgentId): Skill[] =>
	leafSkillBundle(leafAgentSkillNames[id]);

export const leafSkillReference = ({
	skill,
	path,
}: {
	skill: string;
	path: string;
}): string => {
	const reference = findSkill(skill).references.find(
		(candidate) => candidate.path === path,
	);
	if (!reference) {
		throw new Error(`Unknown reference "${path}" in leaf skill "${skill}"`);
	}
	return reference.contents;
};

export const skillToText = (skill: Skill): string =>
	[
		skill.markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim(),
		...skill.references.map((reference) => reference.contents),
	].join("\n\n");

export const leafSkillsText = (): string =>
	leafSkills.map(skillToText).join("\n\n---\n\n");
