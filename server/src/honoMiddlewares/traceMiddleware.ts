import { context, trace } from "@opentelemetry/api";
import type { Context, Next } from "hono";
import { logger } from "@/external/logtail/logtailUtils.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const tracer = trace.getTracer("express");

/**
 * Tracing middleware for OpenTelemetry spans
 * Handles request tracing and span management
 */
export const traceMiddleware = async (c: Context<HonoEnv>, next: Next) => {
	const ctx = c.get("ctx");

	// Create span for tracing
	const spanName = `${c.req.method} ${c.req.url} - ${ctx.id}`;
	const span = tracer.startSpan(spanName);
	span.setAttributes({
		req_id: ctx.id,
		method: c.req.method,
		url: c.req.url,
	});

	// Run the request within the span's context
	await context.with(trace.setSpan(context.active(), span), async () => {
		await next();

		// End span after response
		try {
			span.setAttributes({
				"http.response.status_code": c.res.status,
				"http.response.duration": Date.now() - ctx.timestamp!,
			});
			span.end();

			const closeSpan = tracer.startSpan("response_closed");
			closeSpan.setAttributes({
				req_id: ctx.id,
			});
			closeSpan.end();
		} catch (error) {
			logger.error("Error ending span", { error });
		}
	});
};
