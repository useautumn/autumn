import { asAxiomMap, createLogger, guardLogPayload } from "@autumn/logging";
import type { AnalyticsSink, McpAnalyticsEvent } from "./analyticsTypes.js";

const toLoggerRecord = (event: McpAnalyticsEvent) => ({
	_time: new Date().toISOString(),
	event: event.event,
	surface: event.surface,
	tool: event.tool,
	intent: event.intent,
	status: event.status,
	duration_ms: event.durationMs,
	principal_id: event.principalId,
	client: event.client,
	session_id: event.sessionId,
	context: {
		org_id: event.context.orgId,
		org_slug: event.context.orgSlug,
		env: event.context.env,
		scopes: event.context.scopes,
	},
	input: asAxiomMap({ value: guardLogPayload({ value: event.input }) }),
	output: asAxiomMap({ value: guardLogPayload({ value: event.output }) }),
	error: event.error,
});

export const createLoggerAnalyticsSink = ({
	token,
	orgId,
	dataset,
}: {
	token?: string | undefined;
	orgId?: string | undefined;
	dataset: string;
}): AnalyticsSink | null => {
	if (!token) return null;
	const logger = createLogger({
		service: "mcp",
		dataset,
		preset: "axiom-only",
		outputs: ["axiom"],
		axiomToken: token,
		axiomOrgId: orgId,
	});

	return {
		emit(event) {
			logger.info(toLoggerRecord(event), "MCP tool call");
		},
		flush: async () => {
			await new Promise<void>((resolve) => {
				const flush = logger.flush;
				if (typeof flush !== "function") return resolve();
				flush.call(logger, () => resolve());
			});
		},
	};
};

/** @deprecated Use createLoggerAnalyticsSink. */
export const createAxiomAnalyticsSink = createLoggerAnalyticsSink;
