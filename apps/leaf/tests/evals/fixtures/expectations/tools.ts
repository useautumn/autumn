import type { ToolsCalledExpectation } from "./types.js";

export const tools = {
	called: ({
		toolNames,
	}: {
		toolNames: ToolsCalledExpectation["toolNames"];
	}): ToolsCalledExpectation => ({
		toolNames,
		type: "tools.called",
	}),
};
