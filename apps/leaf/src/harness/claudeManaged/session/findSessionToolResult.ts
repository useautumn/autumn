import type Anthropic from "@anthropic-ai/sdk";

/**
 * Recover a tool's result from session history. The live resume stream can crash
 * ("Tool execution was interrupted by a crash") after the MCP write already ran
 * but before we captured its result — the platform still records the result, so
 * we read it back to tell a real failure from a lost-result false negative.
 */
export const findSessionToolResult = async ({
	client,
	sessionId,
	toolUseId,
}: {
	client: Anthropic;
	sessionId: string;
	toolUseId: string;
}): Promise<{ output: unknown } | undefined> => {
	let found: { output: unknown } | undefined;
	for await (const event of client.beta.sessions.events.list(sessionId)) {
		if (
			event.type !== "agent.mcp_tool_result" ||
			event.mcp_tool_use_id !== toolUseId
		) {
			continue;
		}
		const resultEvent = event as typeof event & {
			is_error?: boolean;
			isError?: boolean;
		};
		const isError = resultEvent.is_error ?? resultEvent.isError;
		const output =
			typeof isError === "boolean"
				? { content: event.content, isError }
				: event.content;
		// Keep the last match in case the tool was retried within the session.
		found = { output };
	}
	return found;
};
