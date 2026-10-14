import { context, trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";

import {
	type TenantAttrs,
	withTenantContext,
} from "@/utils/otel/tenantContext.js";

export const traceEnrichMiddleware: MiddlewareHandler = async (c, next) => {
	const ctx = c.get("ctx") as AutumnContext | undefined;
	if (!ctx) return next();

	const attrs: TenantAttrs = {
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
	};

	const rootSpan = trace.getSpan(context.active());
	if (rootSpan) {
		for (const [key, value] of Object.entries(attrs)) {
			if (value === undefined) continue;
			rootSpan.setAttribute(key, value);
		}
	}

	return withTenantContext({ attrs, fn: () => next() });
};
