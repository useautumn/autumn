import { UnsupportedCommandError } from "@autumn/balance-engine";
import type { Context, MiddlewareHandler, Next } from "hono";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
	BalanceWorkerRequestLog,
} from "../types/balanceWorkerHttp.js";

// Reply bodies are informational; production keeps a sample, everywhere else logs them all.
const PRODUCTION_RESPONSE_SAMPLE_RATE = 0.01;

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
	const requestLog = context.get("requestLog");
	const { command, response, error, errorCode } = requestLog;
	const statusCode = context.res.status;
	const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
	const event = {
		event: "balance_worker.request",
		statusCode,
		durationMs,
		// Same key and field names the server logs under, so one Axiom filter covers both services.
		context: {
			org_id: command?.identity.orgId,
			org_slug: command?.org?.slug,
			env: command?.identity.env,
			customer_id: command?.identity.customerId,
			entity_id: command?.identity.entityId,
		},
		errorCode,
		error,
		req: {
			id: command?.requestId ?? requestLog.id,
			method: context.req.method,
			path: context.req.path,
			body: command && loggedCommandOf({ command }),
		},
		res: shouldLogResponse() ? (response ?? null) : undefined,
		data: {
			route: context.get("request")?.route,
			commandId: command?.commandId,
			featureId: command?.featureId,
			value: command?.value,
			...outcomeOf({ requestLog }),
		},
	};
	const message = `[${statusCode}] ${context.req.method} ${context.req.path} ${durationMs}ms${error ? ` — ${error.name}` : ""}`;
	if (statusCode >= 500) ctx.logger.error(event, message);
	else if (statusCode >= 400) ctx.logger.warn(event, message);
	else ctx.logger.info(event, message);
}

function shouldLogResponse(): boolean {
	if (process.env.NODE_ENV !== "production") return true;
	return Math.random() < PRODUCTION_RESPONSE_SAMPLE_RATE;
}

/** Event properties are customer data and never reach the logs. */
function loggedCommandOf({
	command,
}: {
	command: NonNullable<BalanceWorkerRequestLog["command"]>;
}): Omit<BalanceWorkerRequestLog["command"], "properties"> {
	const { properties: _properties, ...logged } = command;
	return logged;
}

function outcomeOf({ requestLog }: { requestLog: BalanceWorkerRequestLog }) {
	const { response, error } = requestLog;
	const result = response?.result;
	const trackResult =
		result && "type" in result && result.type === "track" ? result : undefined;
	const initializeResult = result && "duplicate" in result ? result : undefined;
	return {
		revision: response?.state.revision,
		duplicate: initializeResult?.duplicate,
		status: trackResult?.status ?? initializeResult?.status,
		reason:
			error instanceof UnsupportedCommandError
				? error.reason
				: trackResult?.reason,
	};
}
