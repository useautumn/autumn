import { context, type Span, trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import { isMapleEnabled } from "@/external/maple/mapleEnabled.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

import {
	type TenantAttrs,
	withTenantContext,
} from "@/utils/otel/tenantContext.js";

const toTenantAttrs = ({ ctx }: { ctx: AutumnContext }): TenantAttrs => ({
	req_id: ctx.id,
	org_id: ctx.org?.id,
	org_slug: ctx.org?.slug,
	env: ctx.env,
	customer_id: ctx.customerId,
	entity_id: ctx.entityId,
	user_id: ctx.userId || undefined,
	auth_type: ctx.authType,
	api_version: ctx.apiVersion?.semver,
	region: process.env.AWS_REGION,
	balance_worker_rollout_enabled:
		ctx.org && ctx.customerId
			? isBalanceWorkerRolloutEnabled({ ctx, customerId: ctx.customerId })
			: undefined,
});

const stampTenantAttrs = ({
	span,
	attrs,
}: {
	span: Span;
	attrs: TenantAttrs;
}) => {
	for (const [key, value] of Object.entries(attrs)) {
		if (value === undefined) continue;
		span.setAttribute(key, value);
	}
};

/**
 * Stamps tenant attrs onto the root HTTP span, then wraps the rest of the
 * chain in an OTel context carrying the same attrs so TenantAttrSpanProcessor
 * propagates them to every child span. Must run AFTER auth/seeder middleware
 * that populates ctx. Works on any router whose ctx extends AutumnContext
 * (apiRouter, internalRouter, stripe/vercel/revenueCat webhook routers, etc).
 */
export const traceEnrichMiddleware: MiddlewareHandler = async (c, next) => {
	const ctx = c.get("ctx") as AutumnContext | undefined;
	if (!ctx) return next();

	const attrs = toTenantAttrs({ ctx });

	const rootSpan = trace.getSpan(context.active());
	if (rootSpan) {
		stampTenantAttrs({ span: rootSpan, attrs });
	}

	return withTenantContext({ attrs, fn: () => next() });
};

/**
 * Stamps tenant attrs onto the active span and nothing else, and only for
 * Maple. A Stripe webhook is acked before its handler runs, which ends the
 * HTTP span before traceEnrichMiddleware gets to it.
 */
export const traceStampMiddleware: MiddlewareHandler = (c, next) => {
	if (isMapleEnabled) {
		try {
			const ctx = c.get("ctx") as AutumnContext | undefined;
			const span = trace.getSpan(context.active());
			if (ctx && span)
				stampTenantAttrs({ span, attrs: toTenantAttrs({ ctx }) });
		} catch {
			// Sits between the idempotency claim and the ack: it must never throw.
		}
	}
	return next();
};
