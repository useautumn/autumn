import { readFileSync } from "node:fs";
import { join } from "node:path";

export const GENERATED_PATHS_FILE = ".github/generated-paths.txt";

const SYNC_ONLY_MARKER = "# sync-only";

// "pr-check" drops everything after `# sync-only`: bot-bumped files that feature PRs may still edit.
export type GeneratedPathsScope = "all" | "pr-check";

export const parseGeneratedPaths = ({
	text,
	scope = "all",
}: {
	text: string;
	scope?: GeneratedPathsScope;
}) => {
	const lines = text.split("\n").map((line) => line.trim());
	const syncOnlyStart = lines.indexOf(SYNC_ONLY_MARKER);
	const scoped =
		scope === "pr-check" && syncOnlyStart !== -1
			? lines.slice(0, syncOnlyStart)
			: lines;
	return scoped.filter((line) => line !== "" && !line.startsWith("#"));
};

export const loadGeneratedPaths = ({
	root,
	scope,
}: {
	root: string;
	scope?: GeneratedPathsScope;
}) =>
	parseGeneratedPaths({
		text: readFileSync(join(root, GENERATED_PATHS_FILE), "utf8"),
		scope,
	});

// Root-anchored globs: `*` stays in one segment, `**` spans any depth, a trailing `/` covers the directory.
const globToRegExp = (pattern: string) => {
	const body = pattern
		.replace(/\/$/, "/**")
		.split(/(\*\*\/|\/\*\*$|\*\*|\*)/)
		.map((part) => {
			if (part === "**/") return "(?:.*/)?";
			if (part === "/**") return "/.*";
			if (part === "**") return ".*";
			if (part === "*") return "[^/]*";
			return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
		})
		.join("");
	return new RegExp(`^${body}$`);
};

export const isGeneratedPath = ({
	patterns,
	path,
}: {
	patterns: string[];
	path: string;
}) => patterns.some((pattern) => globToRegExp(pattern).test(path));
