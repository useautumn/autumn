import { context, type Span, trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import { JobName } from "@/queue/JobName.js";
import { isMapleEnabled } from "./mapleEnabled.js";
import { BILLING_PATHS } from "./parseMapleLog.js";

/** `keep` exports the whole trace; `sample` keeps errors, slow roots and a share of the rest. */
export type MapleTraceMode = "keep" | "sample";
export type MapleTraceScope = "billing" | "hot" | "writes" | "api";

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

// The queue's side of the hot path: one message per usage event or balance sync.
const HOT_JOBS = new Set<string>([
	JobName.Track,
	JobName.InsertEventBatch,
	JobName.SyncBalanceBatchV4,
	JobName.SyncCustomerDirty,
	JobName.PersistPublishedBalanceTransitions,
	JobName.RefreshEntityAggregate,
]);
// What a billing request or Stripe webhook leaves for the worker to finish.
const BILLING_JOBS = new Set<string>([
	JobName.AutoTopUp,
	JobName.StripeWebhookReplay,
	JobName.StoreInvoiceLineItems,
	JobName.StoreDeferredInvoiceLineItems,
]);

const isReadAction = (action: string) =>
	action === "get" ||
	action.startsWith("get_") ||
	action.startsWith("list") ||
	action.startsWith("preview");

const parseScope = (value: string | undefined): MapleTraceScope =>
	value === "billing" || value === "hot" || value === "api" ? value : "writes";

const MAPLE_TRACE_SCOPE = parseScope(process.env.MAPLE_TRACE_SCOPE);

/**
 * Billing requests, webhooks and every state-changing /v1 call are kept whole,
 * since they answer "why is this customer in this state". Reads and the hot
 * path are sampled, and only traced at all with scope `api`. Scope `hot` is
 * `billing` plus the hot path, sampled.
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
	const isHot =
		dot === -1
			? HOT_LEGACY_SEGMENTS.has(segment)
			: HOT_ACTIONS.has(segment.slice(dot + 1));
	if (scope === "hot") return isHot ? "sample" : null;

	const isHotOrRead =
		isHot ||
		(dot === -1 ? method === "GET" : isReadAction(segment.slice(dot + 1)));

	if (!isHotOrRead) return "keep";
	return scope === "api" ? "sample" : null;
};

// The routes whose trace carries what their request log line is read for: the
// decision of a check or track, the plan and Stripe outcome of an attach or
// update, the event of a Stripe webhook. Only these can have that line replaced.
const LOG_REPLACEABLE_PATHS = new Set([
	"/v1/balances.check",
	"/v1/balances.track",
	"/v1/check",
	"/v1/entitled",
	"/v1/track",
	"/v1/events",
	"/v1/billing.attach",
	"/v1/billing.update",
]);
const STRIPE_WEBHOOK_PREFIXES = ["/webhooks/stripe/", "/webhooks/connect/"];

const isLogReplaceableRequest = ({
	method,
	path,
}: {
	method: string;
	path: string;
}) =>
	method === "POST" &&
	(LOG_REPLACEABLE_PATHS.has(path) ||
		STRIPE_WEBHOOK_PREFIXES.some((p) => path.startsWith(p)));

/** Batch and per-event jobs are sent from timers that outlive the request that armed them, so they never join a request's trace. */
export const isHotMapleJob = (jobName: string) => HOT_JOBS.has(jobName);

/** Worker jobs follow the request scopes: billing jobs always, hot jobs sampled with scope `hot` or `api`, the rest with `writes` or `api`. */
export const classifyMapleJob = ({
	jobName,
	scope = MAPLE_TRACE_SCOPE,
}: {
	jobName: string;
	scope?: MapleTraceScope;
}): MapleTraceMode | null => {
	if (BILLING_JOBS.has(jobName)) return "keep";
	if (HOT_JOBS.has(jobName))
		return scope === "api" || scope === "hot" ? "sample" : null;
	return scope === "writes" || scope === "api" ? "keep" : null;
};

// Stripe webhooks keep working after the early ack ends the root span, so
// marks are never cleared on root end; FIFO eviction bounds memory instead.
// Sized so a mark outlives its trace at a few hundred kept traces a second.
const MAX_MARKED_TRACES = 50_000;
// A client can send every request it makes under one trace id.
const MAX_ROOT_SPANS_PER_TRACE = 64;

type MapleTraceMark = {
	mode: MapleTraceMode;
	/** Decides a sampled trace when it ends. */
	rootSpanId: string;
	/** Every request or job span of the trace: a client can send several requests under one trace id. */
	rootSpanIds: Set<string>;
};
const marks = new Map<string, MapleTraceMark>();

const addRootSpanId = ({
	mark,
	spanId,
}: {
	mark: MapleTraceMark;
	spanId: string;
}) => {
	if (mark.rootSpanIds.size < MAX_ROOT_SPANS_PER_TRACE) {
		mark.rootSpanIds.add(spanId);
		return;
	}
	// A root that is not tracked can not decide a sampled trace, so the trace
	// is kept whole instead.
	mark.mode = "keep";
};

export const markTraceForMaple = ({
	traceId,
	rootSpanId,
	mode,
}: {
	traceId: string;
	rootSpanId: string;
	mode: MapleTraceMode;
}) => {
	const existing = marks.get(traceId);
	if (existing) {
		addRootSpanId({ mark: existing, spanId: rootSpanId });
		if (mode === "keep") existing.mode = "keep";
		return;
	}
	if (marks.size >= MAX_MARKED_TRACES) {
		const oldest = marks.keys().next().value;
		if (oldest !== undefined) marks.delete(oldest);
	}
	marks.set(traceId, {
		mode,
		rootSpanId,
		rootSpanIds: new Set([rootSpanId]),
	});
};

export const getMapleTraceMark = (traceId: string) => marks.get(traceId);

export const promoteMapleTrace = (traceId: string) => {
	const mark = marks.get(traceId);
	if (mark) mark.mode = "keep";
};

export const unmarkMapleTrace = (traceId: string) => {
	marks.delete(traceId);
};

/**
 * Must run right after the OTel HTTP middleware, so the root span is active.
 * Does nothing without a Maple key. A span that is not recording (the caller
 * sent an unsampled traceparent) is never marked: nothing would be exported,
 * so nothing may stand in for its logs.
 */
export const mapleTraceScopeMiddleware: MiddlewareHandler = (c, next) => {
	const span = trace.getSpan(context.active());
	if (!isMapleEnabled || !span?.isRecording()) return next();

	const { method, path } = c.req;
	const mode = classifyMapleRequest({ method, path });
	if (mode) {
		const { traceId, spanId } = span.spanContext();
		markTraceForMaple({ traceId, rootSpanId: spanId, mode });
	}
	return next();
};

/** A further span that carries tenant attrs in a trace already going to Maple, e.g. the deferred half of an early-acked webhook. */
export const addMapleTraceRoot = (span: Span) => {
	const { traceId, spanId } = span.spanContext();
	const mark = getMapleTraceMark(traceId);
	if (mark) addRootSpanId({ mark, spanId });
};

/** Marks the active worker span's trace. A job continuing a request's trace is kept, since only kept traces propagate. */
export const markJobTraceForMaple = ({
	jobName,
	isContinued,
}: {
	jobName: string;
	isContinued: boolean;
}) => {
	const span = trace.getSpan(context.active());
	if (!isMapleEnabled || !span?.isRecording()) return;
	const mode = isContinued ? "keep" : classifyMapleJob({ jobName });
	if (!mode) return;

	const { traceId, spanId } = span.spanContext();
	markTraceForMaple({ traceId, rootSpanId: spanId, mode });
};

const REPLACE_REQUEST_LOGS =
	isMapleEnabled && process.env.MAPLE_REPLACE_REQUEST_LOGS === "true";

const TOO_MANY_REQUESTS = 429;

/**
 * True when the request's trace stands in for its summary log line: the route
 * is one whose decision the trace carries and the trace goes to Maple.
 * Decided per request, since a trace id can be shared by requests the trace
 * does not cover. A failed request always logs, and so does a rate-limited
 * one: its trace is sampled like a healthy one.
 */
export const isLogReplacedByMapleTrace = ({
	req,
	statusCode,
	traceId = trace.getActiveSpan()?.spanContext().traceId,
	enabled = REPLACE_REQUEST_LOGS,
}: {
	req: { method: string; path: string };
	statusCode: number;
	traceId?: string;
	enabled?: boolean;
}) =>
	enabled &&
	statusCode < 500 &&
	statusCode !== TOO_MANY_REQUESTS &&
	isLogReplaceableRequest(req) &&
	traceId !== undefined &&
	getMapleTraceMark(traceId) !== undefined;
