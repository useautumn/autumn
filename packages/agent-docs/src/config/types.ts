export type Source = { type: "docs"; page: string };

export type McpFormat = {
	uri: string;
	priority: number;
	sources?: Source[];
	document?: string;
};

export type SkillFormat = {
	file: string;
	public?: boolean;
};

export type Entry = {
	title: string;
	description: string;
	formats: {
		mcp?: McpFormat;
		skill?: SkillFormat;
	};
};

export type AgentDocsConfig = Record<string, Entry>;

export type AgentDefinition = {
	instructions: string;
	skills: string[];
};
