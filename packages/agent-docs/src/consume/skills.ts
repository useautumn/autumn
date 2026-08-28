import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { leafSkillRequires } from "../generated/agent-prompts.generated.js";
import { skills } from "../generated/skills.generated.js";
import type { Skill } from "../translate/formats/types.js";

export { skills };
export type { Skill };

export const findSkill = (name: string): Skill => {
	const skill = skills.find((candidate) => candidate.name === name);
	if (!skill) {
		throw new Error(`Unknown skill "${name}"`);
	}
	return skill;
};

/** The given names plus their transitive `requires`, first-encountered order, deduped. */
export const expandRequires = (names: string[]): string[] => {
	const expanded = [...names];
	for (const name of expanded) {
		for (const required of leafSkillRequires[name] ?? []) {
			if (!expanded.includes(required)) {
				expanded.push(required);
			}
		}
	}
	return expanded;
};

/** One skill plus everything it requires — the set to install together. */
export const skillBundleFor = ({ name }: { name: string }): Skill[] =>
	expandRequires([name]).map(findSkill);

/**
 * Write each skill to `<targetDir>/<name>/` (the Agent Skills layout): SKILL.md
 * plus any bundled references/. Used by atmn init (future).
 */
export const writeSkills = ({ targetDir }: { targetDir: string }): void => {
	for (const skill of skills) {
		const skillDir = join(targetDir, skill.name);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(join(skillDir, "SKILL.md"), skill.markdown);
		for (const reference of skill.references) {
			const referencePath = join(skillDir, reference.path);
			mkdirSync(dirname(referencePath), { recursive: true });
			writeFileSync(referencePath, reference.contents);
		}
	}
};
