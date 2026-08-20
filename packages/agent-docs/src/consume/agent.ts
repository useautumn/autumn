import {
	leafAgentPrompts,
	leafAgentSkillNames,
	leafSkillRequires,
} from "../generated/agent-prompts.generated.js";
import { autumnMcpInstructions } from "../generated/instructions.generated.js";
import { leafPrompts } from "../generated/leaf-prompts.generated.js";
import { skills } from "../generated/skills.generated.js";
import type { Skill } from "../translate/formats/types.js";

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

const findLeafSkill = (name: string): Skill => {
	const skill = leafSkills.find((candidate) => candidate.name === name);
	if (!skill) {
		throw new Error(`Unknown leaf skill "${name}"`);
	}
	return skill;
};

/**
 * The skill bundle for one Eve agent: its declared skills first, then their
 * transitive `requires` in first-encountered order, deduped.
 */
export const leafSkillsFor = (id: LeafAgentId): Skill[] => {
	const names = [...leafAgentSkillNames[id]];
	for (const name of names) {
		for (const required of leafSkillRequires[name] ?? []) {
			if (!names.includes(required)) {
				names.push(required);
			}
		}
	}
	return names.map((name) => findLeafSkill(name));
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

/** Canonical MCP docs a Leaf/eval harness can preload when it needs resource text. */
export const agentDocBundleUris = [
	"autumn://docs/concepts",
	"autumn://docs/plan-management",
	"autumn://docs/billing",
	"autumn://docs/logs",
];
