import { context, trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import { BILLING_PATHS } from "./parseMapleLog.js";

/** `keep` exports the whole trace; `sample` keeps errors, slow roots and a share of the rest. */
export type MapleTraceMode = "keep" | "sample";
export type MapleTraceScope = "billing" | "writes" | "api";

const WEBHOOK_PREFIXES = [
	"/webhooks/stripe/",
	"/webhooks/connect/",
	"/webhooks/revenuecat/",
	"/webhooks/vercel/",
];

// The hot path: called per usage event, and recorded in the events table anyway.
const HOT_ACTIONS = new Set(["check", "track", "batch_track", "track_tokens"]);
const HOT_LEGACY_SEGMENTS = new Set([
	"check",
	"entitled",
	"track",
	"track_tokens",
	"usage",
	"events",
	"query",
]);

const isReadAction = (action: string) =>
	action === "get" ||
	action.startsWith("get_") ||
	action.startsWith("list") ||
	action.startsWith("preview");

const parseScope = (value: string | undefined): MapleTraceScope =>
	value === "billing" || value === "api" ? value : "writes";

const MAPLE_TRACE_SCOPE = parseScope(process.env.MAPLE_TRACE_SCOPE);

/**
 * Billing requests, webhooks and every state-changing /v1 call are kept whole,
 * since they answer "why is this customer in this state". Reads and the hot
 * path are sampled, and only traced at all with scope `api`.
 */
export const classifyMapleRequest = ({
	method,
	path,
	scope = MAPLE_TRACE_SCOPE,
}: {
	method: string;
	path: string;
	scope?: MapleTraceScope;
}): MapleTraceMode | null => {
	if (method === "POST" && WEBHOOK_PREFIXES.some((p) => path.startsWith(p)))
		return "keep";
	if (!path.startsWith("/v1/")) return null;

	const rest = path.slice("/v1/".length);
	const isBilling =
		method === "POST" && BILLING_PATHS.some((p) => rest.startsWith(p));
	if (isBilling) return "keep";
	if (scope === "billing") return null;

	const segment = rest.split("/")[0] ?? "";
	const dot = segment.indexOf(".");
	const isHotOrRead =
		dot === -1
			? method === "GET" || HOT_LEGACY_SEGMENTS.has(segment)
			: HOT_ACTIONS.has(segment.slice(dot + 1)) ||
				isReadAction(segment.slice(dot + 1));

	if (!isHotOrRead) return "keep";
	return scope === "api" ? "sample" : null;
};

// Stripe webhooks keep working after the early ack ends the root span, so
// marks are never cleared on root end; FIFO eviction bounds memory instead.
const MAX_MARKED_TRACES = 10_000;
const marks = new Map<string, { mode: MapleTraceMode; rootSpanId: string }>();

export const markTraceForMaple = ({
	traceId,
	rootSpanId,
	mode,
}: {
	traceId: string;
	rootSpanId: string;
	mode: MapleTraceMode;
}) => {
	if (marks.has(traceId)) return;
	if (marks.size >= MAX_MARKED_TRACES) {
		const oldest = marks.keys().next().value;
		if (oldest !== undefined) marks.delete(oldest);
	}
	marks.set(traceId, { mode, rootSpanId });
};

export const getMapleTraceMark = (traceId: string) => marks.get(traceId);

export const promoteMapleTrace = (traceId: string) => {
	const mark = marks.get(traceId);
	if (mark) mark.mode = "keep";
};

export const unmarkMapleTrace = (traceId: string) => {
	marks.delete(traceId);
};

/** Must run right after the OTel HTTP middleware, so the root span is active. */
export const mapleTraceScopeMiddleware: MiddlewareHandler = (c, next) => {
	const mode = classifyMapleRequest({ method: c.req.method, path: c.req.path });
	if (mode) {
		const span = trace.getSpan(context.active());
		if (span) {
			const { traceId, spanId } = span.spanContext();
			markTraceForMaple({ traceId, rootSpanId: spanId, mode });
		}
	}
	return next();
};
