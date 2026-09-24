import { parseFrontmatter } from "./frontmatter.js";
import { mdxToMarkdown } from "./mdxToMarkdown.js";

const SNIPPET_IMPORT = /^import (\w+) from "(\/snippets\/[^"]+)";?\n/gm;

/**
 * Import a docs `.mdx` page as clean markdown, prefixed with its frontmatter
 * `title` as a heading so the section isn't headless in the agent output.
 * Snippet imports (`import X from "/snippets/…"` + `<X />`) inline when a
 * `readSnippet` is given; otherwise they pass through untouched.
 */
export const docsPageToMarkdown = ({
	path,
	text,
	readSnippet,
}: {
	path: string;
	text: string;
	readSnippet?: (snippetPath: string) => string;
}): string => {
	const { data, body } = parseFrontmatter({ path, text });
	const snippets = new Map<string, string>();
	const withoutImports = readSnippet
		? body.replace(SNIPPET_IMPORT, (_, name: string, snippetPath: string) => {
				snippets.set(name, snippetPath);
				return "";
			})
		: body;
	let inlined = withoutImports;
	for (const [name, snippetPath] of snippets) {
		inlined = inlined.replaceAll(
			`<${name} />`,
			mdxToMarkdown({
				path: snippetPath,
				text: readSnippet?.(snippetPath) ?? "",
			}),
		);
	}
	const content = mdxToMarkdown({ path, text: inlined });
	return data.title ? `## ${data.title}\n\n${content}` : content;
};
