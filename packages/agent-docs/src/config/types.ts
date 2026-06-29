/** A canonical content source, concatenated into a resource in declared order. */
export type Source =
	| { type: "docs"; page: string }
	| { type: "legacy"; file: string };

/**
 * MCP-resource output. `uri` becomes `autumn://docs/<uri>`. Two shapes:
 * - `sources`: fragments (no frontmatter/title) concatenated under a generated
 *   `# Title` heading (e.g. concepts).
 * - `document`: a tagged mdx (own frontmatter + `# Title`) shared with the skill
 *   format; `<part>`/`<docs>` tags are inlined. Path relative to `content/`.
 */
export type McpFormat = {
	uri: string;
	priority: number;
	sources?: Source[];
	document?: string;
};

/**
 * Skill output: composed from a single mdx (frontmatter + agent framing +
 * `<docs url="…" />` / `<legacy file="…" />` insertion tags). `file` is relative
 * to `content/`. Skill name/description come from that mdx's frontmatter.
 */
export type SkillFormat = {
	file: string;
};

/** One translatable unit and the formats it emits. */
export type Entry = {
	title: string;
	description: string;
	formats: {
		mcp?: McpFormat;
		skill?: SkillFormat;
	};
};

/** The whole config, keyed by entry id (e.g. "concepts"). */
export type AgentDocsConfig = Record<string, Entry>;
