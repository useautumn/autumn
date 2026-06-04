import type { createTool } from "@mastra/core/tools";
import { type AutumnMcpAuth, getAutumnAuth } from "../server/auth/auth.js";
import { getIntent } from "../tools/utils/intent.js";
import { isAnalyticsEnabled } from "./analyticsSink.js";
import type { McpAnalyticsSurface } from "./analyticsTypes.js";
import { emitMcpToolEvent } from "./emitToolEvent.js";

type AnyTool = ReturnType<typeof createTool>;
type ToolContext = Parameters<NonNullable<AnyTool["execute"]>>[1];

const getHeadersFromContext = (
	context: ToolContext,
): Record<string, string | undefined> | undefined => {
	const extra = (
		context as {
			mcp?: {
				extra?: {
					requestInfo?: { headers?: Record<string, string | undefined> };
				};
			};
		}
	)?.mcp?.extra;
	return extra?.requestInfo?.headers;
};

const getHeader = (
	headers: Record<string, string | undefined> | undefined,
	name: string,
): string | undefined => {
	const direct = headers?.[name] ?? headers?.[name.toLowerCase()];
	if (direct) return direct;
	const entry = Object.entries(headers ?? {}).find(
		([key]) => key.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
};

const extractRequest = (input: unknown): unknown =>
	input && typeof input === "object" && "request" in input
		? (input as { request: unknown }).request
		: input;

/**
 * Wraps each tool's `execute` to emit a usage event per call. Auth/identity is
 * read from the same MCP context the tools already use, so an unauthenticated
 * call simply skips analytics (it would have failed in the tool anyway).
 *
 * Tools are wrapped once when the MCP server is created. The wrapper keeps no
 * per-request mutable state; auth/session data is read from the execution
 * context for each tool call.
 *
 * @param tools    The toolset to instrument (mutated in place and returned).
 * @param surface  Origin of the calls — `mcp` (external clients) or `agent`
 *                 (our own Autumn Ops agent).
 */
export const instrumentToolsWithAnalytics = <
	T extends Record<string, AnyTool>,
>({
	tools,
	surface,
}: {
	tools: T;
	surface: McpAnalyticsSurface;
}): T => {
	if (!isAnalyticsEnabled()) return tools;

	for (const [toolId, tool] of Object.entries(tools)) {
		const original = tool.execute;
		if (!original) continue;
		tool.execute = (async (input: unknown, context: ToolContext) => {
			const started = Date.now();
			let auth: AutumnMcpAuth | undefined;
			try {
				auth = getAutumnAuth(context);
			} catch {
				return original(input as never, context as never);
			}
			const headers = getHeadersFromContext(context);
			const client = getHeader(headers, "user-agent");
			const transportSessionId = getHeader(headers, "mcp-session-id");
			const intent = getIntent(input);
			try {
				const output = await original(input as never, context as never);
				emitMcpToolEvent({
					surface,
					toolId,
					auth,
					client,
					transportSessionId,
					intent,
					status: "ok",
					durationMs: Date.now() - started,
					input: extractRequest(input),
					output,
				});
				return output;
			} catch (error) {
				emitMcpToolEvent({
					surface,
					toolId,
					auth,
					client,
					transportSessionId,
					intent,
					status: "error",
					durationMs: Date.now() - started,
					input: extractRequest(input),
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
		}) as AnyTool["execute"];
	}
	return tools;
};
