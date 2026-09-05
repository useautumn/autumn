import type { Context, MiddlewareHandler, Next } from "hono";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
} from "../types/balanceWorkerHttp.js";

export function requestLoggingMiddleware({
	ctx,
}: {
	ctx: BalanceWorkerHttpContext;
}): MiddlewareHandler<BalanceWorkerHttpEnv> {
	async function logRequest(
		context: Context<BalanceWorkerHttpEnv>,
		next: Next,
	) {
		context.set("requestLog", { id: crypto.randomUUID() });
		const startedAt = performance.now();
		await next();
		try {
			logRequestResult({ ctx, context, startedAt });
		} catch (cause) {
			// A logging failure cannot turn a committed request into an HTTP error.
			console.error("Balance worker request logging failed", cause);
		}
	}
	return logRequest;
}

function logRequestResult({
	ctx,
	context,
	startedAt,
}: {
	ctx: BalanceWorkerHttpContext;
	context: Context<BalanceWorkerHttpEnv>;
	startedAt: number;
}): void {
	const { id, command, decision, error, errorCode } = context.get("requestLog");
	const outcome =
		decision && decision.kind !== "unsupported" ? decision.outcome : undefined;
	const statusCode = context.res.status;
	const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
	const event = {
		event: "balance_worker.request",
		req: {
			id: command?.requestId ?? id,
			method: context.req.method,
			path: context.req.path,
		},
		statusCode,
		durationMs,
		context: {
			org_id: command?.identity.orgId,
			env: command?.identity.env,
			customer_id: command?.identity.customerId,
			entity_id: command?.entityId,
		},
		extras: {
			commandId: command?.commandId,
			featureId: command?.featureId,
			value: command?.value,
			route: context.get("request")?.route,
			decision: decision?.kind,
			status: outcome?.status,
			reason:
				decision?.kind === "unsupported" ? decision.reason : outcome?.reason,
			appliedValue: outcome?.appliedValue,
			balanceAfter: outcome?.balanceAfter,
			errorCode,
			error,
		},
	};
	const message = `[${statusCode}] ${context.req.method} ${context.req.path} ${durationMs}ms${error ? ` — ${error.name}` : ""}`;
	if (statusCode >= 500) ctx.logger.error(event, message);
	else if (statusCode >= 400) ctx.logger.warn(event, message);
	else ctx.logger.info(event, message);
}
