export type ResourceAudience = "assistant";

export type ResourceFrontmatter = {
	name: string;
	title: string;
	description: string;
	priority: number;
	audience: ResourceAudience[];
};

export type AutumnMcpResourceDoc = ResourceFrontmatter & {
	uri: string;
	text: string;
};
