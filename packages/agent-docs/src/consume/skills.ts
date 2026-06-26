import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { skills } from "../generated/skills.generated.js";

export { skills };

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
