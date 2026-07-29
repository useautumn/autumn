import { parseFrontmatter } from "./frontmatter.js";
import { mdxToMarkdown } from "./mdxToMarkdown.js";

/**
 * Import a docs `.mdx` page as clean markdown, prefixed with its frontmatter
 * `title` as a heading so the section isn't headless in the agent output.
 */
export const docsPageToMarkdown = ({
	path,
	text,
}: {
	path: string;
	text: string;
}): string => {
	const { data, body } = parseFrontmatter({ path, text });
	const content = mdxToMarkdown({ path, text: body });
	return data.title ? `## ${data.title}\n\n${content}` : content;
};
