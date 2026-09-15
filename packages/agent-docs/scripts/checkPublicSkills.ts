import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import config from "../agent-docs.config.js";
import { parseFrontmatter } from "../src/translate/ingest/frontmatter.js";
import { publishedSkillName } from "../src/translate/publishedSkillName.js";
import { validateGeneratedSkillDirectory } from "./publicSkills.js";

const contentRoot = resolve(import.meta.dir, "../content");

const expectedSkillNames = Object.values(config)
	.filter((entry) => entry.formats.skill?.public)
	.map((entry) => entry.formats.skill?.file)
	.filter((file): file is string => Boolean(file))
	.map((file) => {
		const path = resolve(contentRoot, file);
		const { data } = parseFrontmatter({
			path,
			text: readFileSync(path, "utf8"),
		});
		if (!data.name) {
			throw new Error(`Skill ${file} is missing frontmatter name`);
		}
		return publishedSkillName({ name: data.name });
	});

validateGeneratedSkillDirectory({
	directory: resolve(import.meta.dir, "../generated/skills"),
	expectedSkillNames,
});

process.stdout.write(
	`Validated ${expectedSkillNames.length} generated public skills\n`,
);
