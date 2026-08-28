export type ToolUse = {
	name: string;
	input: Record<string, unknown>;
	/** 0-based index of the user turn this tool call happened in */
	turn: number;
};
