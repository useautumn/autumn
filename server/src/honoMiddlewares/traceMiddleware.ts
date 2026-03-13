import { context, trace } from "@opentelemetry/api";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

/**
 * Enriches the active OTel span (created by @hono/otel) with
 * request-specific context like org, env, and customer info.
 */
export const traceEnrichMiddleware = async (
	c: Context<HonoEnv>,
	next: Next,
) => {
	await next();

	const span = trace.getSpan(context.active());
	if (!span) return;

	const ctx = c.get("ctx");

	const attrs: Record<string, string> = {
		req_id: ctx.id,
	};

	if (ctx.org) {
		attrs.org_id = ctx.org.id;
		attrs.org_slug = ctx.org.slug;
	}

	if (ctx.env) {
		attrs.env = ctx.env;
	}

	if (ctx.customerId) {
		attrs.customer_id = ctx.customerId;
	}

	span.setAttributes(attrs);
};
