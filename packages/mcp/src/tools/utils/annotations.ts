/** MCP tool hints describing the side effects of a tool call. */
export const mcpAnnotations = ({
	destructive = false,
	idempotent = false,
}: {
	destructive?: boolean;
	idempotent?: boolean;
} = {}) => ({
	readOnlyHint: !destructive && !idempotent,
	destructiveHint: destructive,
	idempotentHint: idempotent,
	openWorldHint: false,
});
