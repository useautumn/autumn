export type ToolUse = {
	name: string;
	input: Record<string, unknown>;
	/** 0-based index of the user turn this tool call happened in */
	turn: number;
	/** the SDK's tool_use block id, used to pair the tool_result */
	id?: string;
	/** outcome delivered back to the model, once it arrives */
	result?: { text: string; isError: boolean };
};
