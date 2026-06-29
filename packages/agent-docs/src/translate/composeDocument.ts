import { parseFrontmatter } from "./ingest/frontmatter.js";

// Inline a sibling content file at this tag.
const PART_TAG = /<part\s+([^>]*?)\/>/g;
// Inline a translated docs page at this tag.
const DOCS_TAG = /<docs\s+([^>]*?)\/>/g;
// A skill splits these into references/; a document inlines the docs page.
const REFERENCE_TAG = /<reference\s+([^>]*?)\/>/g;
// Point at a prerequisite resource the agent should read first.
const SKILL_TAG = /<skill\s+([^>]*?)\/>/g;
const ATTR = /(\w+)="([^"]*)"/g;

const parseAttrs = (raw: string): Record<string, string> => {
	const attrs: Record<string, string> = {};
	for (const match of raw.matchAll(ATTR)) {
		attrs[match[1] as string] = match[2] as string;
	}
	return attrs;
};

/**
 * Render a tagged mdx into an MCP resource body: strip frontmatter, then inline
 * its tags in place. `<part>`/`<docs>`/`<reference>` inline a content file or
 * docs page; `<skill>` becomes a "read X first" pointer. Shares its source with
 * the skill format, which instead splits parts into `references/`.
 */
export const composeDocument = ({
	path,
	text,
	resolveContentFile,
	resolveDocs,
}: {
	path: string;
	text: string;
	resolveContentFile: (file: string) => string;
	resolveDocs: (url: string) => string;
}): string => {
	const { body } = parseFrontmatter({ path, text });
	return body
		.replace(SKILL_TAG, (_match, raw: string) => {
			const { name, reason } = parseAttrs(raw);
			if (!name) {
				throw new Error(`<skill> in ${path} is missing a name`);
			}
			return reason
				? `First read the \`${name}\` knowledge — ${reason}.`
				: `First read the \`${name}\` knowledge.`;
		})
		.replace(REFERENCE_TAG, (_match, raw: string) => {
			const { url } = parseAttrs(raw);
			if (!url) {
				throw new Error(`<reference> in ${path} is missing a url`);
			}
			return resolveDocs(url).trim();
		})
		.replace(PART_TAG, (_match, raw: string) => {
			const { file } = parseAttrs(raw);
			if (!file) {
				throw new Error(`<part> in ${path} is missing a file`);
			}
			return resolveContentFile(file).trim();
		})
		.replace(DOCS_TAG, (_match, raw: string) => {
			const { url } = parseAttrs(raw);
			if (!url) {
				throw new Error(`<docs> in ${path} is missing a url`);
			}
			return resolveDocs(url).trim();
		})
		.replace(/\n{3,}/g, "\n\n")
		.trim();
};
