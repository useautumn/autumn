import { resolveAutumnOrgId } from "../agent/axiom.js";
import type { AutumnMcpAuth } from "../server/auth/auth.js";
import { getAnalyticsSink } from "./analyticsSink.js";
import type { McpAnalyticsSurface } from "./analyticsTypes.js";
import { deriveSessionId } from "./sessionId.js";

/**
 * Builds and dispatches a single tool-call analytics event. Org resolution and
 * the actual sink write run off the hot path so the tool response is never
 * delayed by analytics.
 */
export const emitMcpToolEvent = ({
	surface,
	toolId,
	auth,
	client,
	status,
	durationMs,
	input,
	output,
	error,
}: {
	surface: McpAnalyticsSurface;
	toolId: string;
	auth: AutumnMcpAuth;
	client: string | undefined;
	status: "ok" | "error";
	durationMs: number;
	input?: unknown;
	output?: unknown;
	error?: string | undefined;
}) => {
	const sink = getAnalyticsSink();

	// Resolve org off the hot path; resolveAutumnOrgId is cached (~5min).
	void (async () => {
		let orgId = auth.orgId;
		if (!orgId) {
			try {
				orgId = await resolveAutumnOrgId(auth);
			} catch {
				// Best-effort: emit without org_id rather than dropping the event.
			}
		}
		const now = Date.now();
		sink.emit({
			event: "mcp.tool_call",
			surface,
			tool: toolId,
			status,
			durationMs,
			orgId,
			principalId: auth.principalId,
			env: auth.env,
			client,
			sessionId: deriveSessionId({
				principalId: auth.principalId,
				client,
				now,
			}),
			scopes: auth.scopes,
			input,
			output,
			error,
		});
	})();
};
