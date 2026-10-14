export type ResourceAudience = "assistant";

export type McpResource = {
	name: string;
	title: string;
	description: string;
	priority: number;
	audience: ResourceAudience[];
	uri: string;
	text: string;
};

export type SkillFile = {
	path: string;
	contents: string;
};

export type Skill = {
	name: string;
	description: string;
	markdown: string;
	references: SkillFile[];
	requires?: string[];
};
