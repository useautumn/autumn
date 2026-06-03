import { Axiom } from "@axiomhq/js";
import type { AnalyticsSink, McpAnalyticsEvent } from "./analyticsTypes.js";

const maxPayloadBytes =
	Number(process.env.MCP_ANALYTICS_MAX_PAYLOAD_BYTES) || 512_000;

/**
 * Map fields require an object value. Wrap scalars/arrays so heterogeneous
 * tool outputs still land in a single Axiom map field instead of conflicting
 * on type.
 */
const asMap = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: { value };

/**
 * Keep individual events under Axiom's 1MB field cap. Oversized payloads are
 * replaced with a marker rather than dropping the whole (otherwise rejected)
 * event.
 */
const guardPayload = (value: unknown): unknown => {
	if (value === undefined) return undefined;
	try {
		const json = JSON.stringify(value);
		if (json && json.length > maxPayloadBytes) {
			return { _truncated: true, _bytes: json.length };
		}
		return value;
	} catch {
		return { _unserializable: true };
	}
};

const toAxiomRecord = (event: McpAnalyticsEvent) => ({
	_time: new Date().toISOString(),
	event: event.event,
	surface: event.surface,
	tool: event.tool,
	status: event.status,
	duration_ms: event.durationMs,
	org_id: event.orgId,
	principal_id: event.principalId,
	env: event.env,
	client: event.client,
	session_id: event.sessionId,
	scopes: event.scopes,
	// Map fields — see scripts/axiom/createLeafDataset.ts
	input: asMap(guardPayload(event.input)),
	output: asMap(guardPayload(event.output)),
	error: event.error,
});

export const createAxiomAnalyticsSink = ({
	token,
	orgId,
	dataset,
}: {
	token?: string | undefined;
	orgId?: string | undefined;
	dataset: string;
}): AnalyticsSink | null => {
	if (!token) return null;
	const client = new Axiom({ token, orgId });
	return {
		emit(event) {
			// Axiom batches internally; no inline await on the hot path.
			client.ingest(dataset, [toAxiomRecord(event)]);
		},
		flush: () => client.flush(),
	};
};
