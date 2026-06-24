import { parseFrontmatter } from "./ingest/frontmatter.js";

// Inline a sibling content file at this tag.
const PART_TAG = /<part\s+([^>]*?)\/>/g;
// Inline a translated docs page at this tag.
const DOCS_TAG = /<docs\s+([^>]*?)\/>/g;
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
 * `<part file="…" />` (sibling content file) and `<docs url="…" />` (docs page)
 * in place. Shares its source with the skill format, which instead splits parts
 * into `references/` for progressive disclosure.
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
		.trim();
};
