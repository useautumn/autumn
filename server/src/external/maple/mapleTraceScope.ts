import { context, trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import { BILLING_PATHS } from "./parseMapleLog.js";

const STRIPE_WEBHOOK_PREFIXES = ["/webhooks/stripe/", "/webhooks/connect/"];

// Stripe webhooks keep working after the early ack ends the root span, so
// marks are never cleared on root end; FIFO eviction bounds memory instead.
const MAX_SCOPED_TRACES = 10_000;
const scopedTraceIds = new Set<string>();

/** Same scope as the log tap: billing POSTs under /v1/ and Stripe webhooks. */
export const isMapleScopedRequest = ({
	method,
	path,
}: {
	method: string;
	path: string;
}) => {
	if (method !== "POST") return false;
	if (STRIPE_WEBHOOK_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		return true;
	}
	if (!path.startsWith("/v1/")) return false;
	return BILLING_PATHS.some((billingPath) =>
		path.startsWith(billingPath, "/v1/".length),
	);
};

export const markTraceForMaple = (traceId: string) => {
	if (scopedTraceIds.has(traceId)) return;
	if (scopedTraceIds.size >= MAX_SCOPED_TRACES) {
		const oldest = scopedTraceIds.values().next().value;
		if (oldest !== undefined) scopedTraceIds.delete(oldest);
	}
	scopedTraceIds.add(traceId);
};

export const isTraceMarkedForMaple = (traceId: string) =>
	scopedTraceIds.has(traceId);

/** Must run right after the OTel HTTP middleware, so the root span is active. */
export const mapleTraceScopeMiddleware: MiddlewareHandler = (c, next) => {
	if (isMapleScopedRequest({ method: c.req.method, path: c.req.path })) {
		const span = trace.getSpan(context.active());
		if (span) markTraceForMaple(span.spanContext().traceId);
	}
	return next();
};
