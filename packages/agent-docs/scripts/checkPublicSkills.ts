import { resolve } from "node:path";
import config from "../agent-docs.config.js";
import { publishedSkillName } from "../src/translate/publishedSkillName.js";
import { validateGeneratedSkillDirectory } from "./publicSkills.js";

const expectedSkillNames = Object.values(config)
	.map((entry) => entry.formats.skill?.file)
	.filter((file): file is string => Boolean(file))
	.map((file) => {
		const sourceName = file.split("/").at(-2);
		if (!sourceName) {
			throw new Error(`Cannot derive public skill name from "${file}"`);
		}
		return publishedSkillName({ name: sourceName });
	});

validateGeneratedSkillDirectory({
	directory: resolve(import.meta.dir, "../generated/skills"),
	expectedSkillNames,
});

process.stdout.write(
	`Validated ${expectedSkillNames.length} generated public skills\n`,
);
