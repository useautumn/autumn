import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { SKILLS_DIR_NAME } from "./skills";

export const ignoreBundledSkills = ({
	repoRoot,
	configDir,
}: {
	repoRoot: string;
	configDir: string;
}): void => {
	const path = relative(repoRoot, join(configDir, SKILLS_DIR_NAME));
	if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) return;
	if (/[\r\n]/.test(path)) return;
	const pattern = `/${path
		.split(sep)
		.join("/")
		.replace(/[\\*?[\] ]/g, "\\$&")}/`;
	const ignorePath = join(repoRoot, ".gitignore");
	const contents = existsSync(ignorePath)
		? readFileSync(ignorePath, "utf8")
		: "";
	if (contents.split(/\r?\n/).includes(pattern)) return;
	const newline = contents.includes("\r\n") ? "\r\n" : "\n";
	const separator =
		contents.length > 0 && !contents.endsWith("\n") ? newline : "";
	writeFileSync(
		ignorePath,
		`${contents}${separator}${pattern}${newline}`,
		"utf8",
	);
};
