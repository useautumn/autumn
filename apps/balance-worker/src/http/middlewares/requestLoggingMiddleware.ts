import { UnsupportedCommandError } from "@autumn/balance-engine";
import type { Context, MiddlewareHandler, Next } from "hono";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
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
			timeSync({ label: "request.log" }, () =>
				logRequestResult({ ctx, context, startedAt }),
			);
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
	const { command, response, error, errorCode, batch } = requestLog;
	const statusCode = context.res.status;
	const identity = command?.identity ?? batch?.identity;
	const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
	const event = {
		event: "balance_worker.request",
		statusCode,
		durationMs,
		// Same key and field names the server logs under, so one Axiom filter covers both services.
		context: {
			org_id: identity?.orgId,
			org_slug: command?.org?.slug ?? batch?.orgSlug,
			env: identity?.env,
			customer_id: identity?.customerId,
			entity_id: identity?.entityId,
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
			route: context.get("request")?.route ?? batch?.route,
			commandId: command?.commandId,
			featureId: command?.featureId,
			value: command?.value,
			batch: batch && loggedBatchOf({ batch }),
			...outcomeOf({ requestLog }),
		},
	};
	const message = `[${statusCode}] ${context.req.method} ${context.req.path} ${durationMs}ms${error ? ` — ${error.name}` : ""}`;
	// A batch answers 200 around its commands' failures; the worst of them sets the level.
	const severity = Math.max(statusCode, batch?.worstStatus ?? 0);
	if (severity >= 500) ctx.logger.error(event, message);
	else if (severity >= 400) ctx.logger.warn(event, message);
	else ctx.logger.info(event, message);
}

function loggedBatchOf({
	batch,
}: {
	batch: NonNullable<BalanceWorkerRequestLog["batch"]>;
}) {
	const { count, succeeded, failed, errorCodes } = batch;
	return { count, succeeded, failed, errorCodes };
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
	// A read decides nothing, so it has no result to report.
	const result = response && "result" in response ? response.result : undefined;
	// A track and a finalize both report a status and a reason.
	const trackResult =
		result &&
		"type" in result &&
		(result.type === "track" || result.type === "finalize")
			? result
			: undefined;
	const initializeResult = result && "duplicate" in result ? result : undefined;
	return {
		// An expired lock replies with its result alone.
		revision:
			response && "state" in response ? response.state.revision : undefined,
		duplicate: initializeResult?.duplicate,
		status: trackResult?.status ?? initializeResult?.status,
		reason:
			error instanceof UnsupportedCommandError
				? error.reason
				: trackResult?.reason,
	};
}
