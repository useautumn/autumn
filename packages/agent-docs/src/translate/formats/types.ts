export type ResourceAudience = "assistant";

/** An MCP resource, shaped to match the MCP server resource contract. */
export type McpResource = {
	name: string;
	title: string;
	description: string;
	priority: number;
	audience: ResourceAudience[];
	uri: string;
	text: string;
};

/** A file bundled under a skill folder (e.g. `references/plan-items.md`). */
export type SkillFile = {
	/** Path relative to the skill folder. */
	path: string;
	contents: string;
};

/** A skill artifact: the rendered SKILL.md plus any bundled reference files. */
export type Skill = {
	name: string;
	description: string;
	/** Full SKILL.md contents (frontmatter + framing + body with reference pointers). */
	markdown: string;
	/** Detailed docs split out for on-demand (progressive-disclosure) loading. */
	references: SkillFile[];
};
