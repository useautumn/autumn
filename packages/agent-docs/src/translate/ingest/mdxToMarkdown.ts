const FRONTMATTER = /^---\n[\s\S]*?\n---\n?/;
const MDX_COMMENT = /\{\/\*[\s\S]*?\*\/\}/g;
const UNWRAP_TAGS =
	/<\/?(?:Accordion|AccordionGroup|Info|Note|Tip|Warning|Check|Card|CardGroup|Tabs|Tab|Expandable)(?:\s[^>]*)?>/g;
const DASHBOARD_TAB = /<Tab\s+title="Dashboard"[^>]*>[\s\S]*?<\/Tab>/g;

export const mdxToMarkdown = ({
	text,
}: {
	path: string;
	text: string;
}): string =>
	text
		.replace(FRONTMATTER, "")
		.replace(MDX_COMMENT, "")
		.replace(DASHBOARD_TAB, "")
		.replace(UNWRAP_TAGS, "")
		.replace(/\\\$/g, "$")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
