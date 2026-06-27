const FRONTMATTER = /^---\n[\s\S]*?\n---\n?/;
const MDX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;
// Layout/callout wrappers we unwrap (keep children, drop the tag) when copying a
// docs page into an agent resource. Add component names here as docs use them.
const UNWRAP_TAGS =
	/<\/?(?:Accordion|AccordionGroup|Info|Note|Tip|Warning|Check|Card|CardGroup)(?:\s[^>]*)?>/g;

/**
 * Copy a docs `.mdx` page into clean markdown for an agent resource: strip
 * frontmatter and MDX comments, and unwrap layout/callout components so their
 * content (e.g. the collapsed "Agent reference" accordion) is included inline.
 */
export const mdxToMarkdown = ({
	text,
}: {
	path: string;
	text: string;
}): string =>
	text
		.replace(FRONTMATTER, "")
		.replace(MDX_COMMENT, "")
		.replace(UNWRAP_TAGS, "")
		// Undo MDX escaping that exists only for human rendering (e.g. \$ avoids
		// LaTeX math); the agent wants the literal character.
		.replace(/\\\$/g, "$")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
