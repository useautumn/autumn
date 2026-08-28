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

/**
 * Leaf's system prompt for a surface, composed from `content/instructions/*`
 * (shared base + per-surface nudge). The dashboard leans toward plan modelling;
 * Slack toward billing + investigation.
 */
export const leafSystemPrompt = (surface: LeafSurface): string =>
	leafPrompts[surface];

/**
 * The skills that are Leaf's knowledge: concepts, modelling-pricing, billing,
 * investigate. The single source — claude-managed attaches them, mastra inlines
 * them. Skills cross-reference (each points at concepts first).
 */
export const leafSkills: Skill[] = skills;

export type LeafAgentId = keyof typeof leafAgentPrompts;

/** The composed system prompt for one Eve agent (orchestrator or specialist). */
export const leafAgentPrompt = (id: LeafAgentId): string =>
	leafAgentPrompts[id];

/**
 * A skill bundle: the named skills first, then their transitive `requires`
 * in first-encountered order, deduped.
 */
export const leafSkillBundle = (skillNames: readonly string[]): Skill[] =>
	expandRequires([...skillNames]).map(findSkill);

/** The skill bundle for one Eve agent, resolved from its declared skills. */
export const leafSkillsFor = (id: LeafAgentId): Skill[] =>
	leafSkillBundle(leafAgentSkillNames[id]);

/** One reference file's contents from a leaf skill — the shared source for
 * prompts that need a single doc (e.g. billing-request generation). */
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

/** Inline a skill's full content (SKILL.md body + references) for engines that
 * can't attach skills natively (mastra). */
export const skillToText = (skill: Skill): string =>
	[
		skill.markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim(),
		...skill.references.map((reference) => reference.contents),
	].join("\n\n");

/** All Leaf skills inlined as one block, for the mastra system prompt. */
export const leafSkillsText = (): string =>
	leafSkills.map(skillToText).join("\n\n---\n\n");
