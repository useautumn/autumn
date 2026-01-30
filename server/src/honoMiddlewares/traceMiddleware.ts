import { context, trace } from "@opentelemetry/api";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const tracer = trace.getTracer("hono");

/**
 * Lightweight tracing middleware for OpenTelemetry spans.
 * Creates one span per request (removed redundant "response_closed" span).
 */
export const traceMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	const span = tracer.startSpan(`${c.req.method} ${c.req.path}`);
	span.setAttributes({
		req_id: ctx.id,
		method: c.req.method,
		path: c.req.path,
	});

	try {
		await context.with(trace.setSpan(context.active(), span), next);
	} finally {
		span.setAttributes({
			"http.status_code": c.res.status,
			"http.duration_ms": Date.now() - ctx.timestamp!,
		});
		span.end();
	}
};
