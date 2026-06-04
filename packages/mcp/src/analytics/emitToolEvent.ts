import { resolveAutumnOrg } from "../agent/axiom.js";
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
	transportSessionId,
	intent,
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
	transportSessionId?: string | undefined;
	intent?: string | undefined;
	status: "ok" | "error";
	durationMs: number;
	input?: unknown;
	output?: unknown;
	error?: string | undefined;
}) => {
	const sink = getAnalyticsSink();

	// Resolve org off the hot path; resolveAutumnOrg is cached (~5min).
	void (async () => {
		let orgId = auth.orgId;
		let orgSlug: string | undefined;
		try {
			const org = await resolveAutumnOrg(auth);
			orgId = org.id;
			orgSlug = org.slug;
		} catch {
			// Best-effort: emit without org context rather than dropping the event.
		}
		const now = Date.now();
		sink.emit({
			event: "mcp.tool_call",
			surface,
			tool: toolId,
			intent,
			status,
			durationMs,
			principalId: auth.principalId,
			client,
			sessionId:
				transportSessionId ??
				deriveSessionId({
					principalId: auth.principalId,
					client,
					now,
				}),
			context: {
				orgId,
				orgSlug,
				env: auth.env,
				scopes: auth.scopes,
			},
			input,
			output,
			error,
		});
	})();
};
