import { parseFrontmatter } from "./ingest/frontmatter.js";

const PART_TAG = /<part\s+([^>]*?)\/>/g;
const POINTER_TAG = /<pointer\s+([^>]*?)\/>/g;
const DOCS_TAG = /<docs\s+([^>]*?)\/>/g;
const REFERENCE_TAG = /<reference\s+([^>]*?)\/>/g;
const SKILL_TAG = /<skill\s+([^>]*?)\/>/g;
const ATTR = /(\w+)="([^"]*)"/g;

const parseAttrs = (raw: string): Record<string, string> => {
	const attrs: Record<string, string> = {};
	for (const match of raw.matchAll(ATTR)) {
		attrs[match[1] as string] = match[2] as string;
	}
	return attrs;
};

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
			const { name, reason, text } = parseAttrs(raw);
			if (!name) {
				throw new Error(`<skill> in ${path} is missing a name`);
			}
			if (text) {
				return text;
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
		.replace(POINTER_TAG, (_match, raw: string) => {
			const { file } = parseAttrs(raw);
			if (!file) {
				throw new Error(`<pointer> in ${path} is missing a file`);
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
