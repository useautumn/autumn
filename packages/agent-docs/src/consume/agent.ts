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
