import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const pruneApiReferencePages = ({
	docsDir,
	generatedPages,
}: {
	docsDir: string;
	generatedPages: string[];
}): void => {
	const currentPages = new Set(generatedPages);
	const removedPages = new Set<string>();
	for (const file of new Bun.Glob("api-reference/**/*.mdx").scanSync(docsDir)) {
		const page = file.slice(0, -".mdx".length);
		if (currentPages.has(page)) continue;
		const content = readFileSync(path.join(docsDir, file), "utf-8");
		const generatedReference =
			content.includes(
				'import { DynamicParamField } from "/snippets/dynamic-param-field.jsx";',
			) ||
			/^openapi: ["']?api\/openapi\.yml webhook /m.test(content) ||
			content.includes(
				"<Note>Schema documentation for this event type is coming soon.</Note>",
			);
		if (!generatedReference) continue;
		unlinkSync(path.join(docsDir, file));
		removedPages.add(page);
	}
	if (removedPages.size === 0) return;

	const removePageReferences = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			return value
				.filter(
					(entry) => typeof entry !== "string" || !removedPages.has(entry),
				)
				.map(removePageReferences);
		}
		if (value && typeof value === "object") {
			return Object.fromEntries(
				Object.entries(value).map(([key, entry]) => [
					key,
					removePageReferences(entry),
				]),
			);
		}
		return value;
	};
	const docsJsonPath = path.join(docsDir, "docs.json");
	const config = JSON.parse(readFileSync(docsJsonPath, "utf-8"));
	config.navigation = removePageReferences(config.navigation);
	writeFileSync(docsJsonPath, `${JSON.stringify(config, null, "\t")}\n`);
};
