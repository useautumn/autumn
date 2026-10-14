export type ToolUse = {
	name: string;
	input: Record<string, unknown>;
	turn: number;
	id?: string;
	result?: { text: string; isError: boolean };
};
