import { context, trace } from "@opentelemetry/api";
import type { Context, Next } from "hono";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
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

	const attrs: Record<string, string | boolean> = {
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
		attrs.full_subject_rollout_enabled = isFullSubjectRolloutEnabled({ ctx });
	}

	span.setAttributes(attrs);
};
