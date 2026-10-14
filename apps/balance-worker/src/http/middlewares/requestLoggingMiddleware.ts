import { UnsupportedCommandError } from "@autumn/balance-engine";
import type { PartitionRoute } from "@autumn/balance-worker-client/protocol";
import type { Context, MiddlewareHandler, Next } from "hono";
import { timeSync } from "../../logging/eventLoopStalls/syncSections.js";
import { OwnedPartitionNotReadyError } from "../../runtime/runtimeErrors.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
	BalanceWorkerRequestLog,
} from "../types/balanceWorkerHttp.js";

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
				logWorkerRequest({
					ctx,
					requestLog: context.get("requestLog"),
					statusCode: context.res.status,
					method: context.req.method,
					path: context.req.path,
					route: context.get("request")?.route,
					startedAt,
				}),
			);
		} catch (cause) {
			console.error("Balance worker request logging failed", cause);
		}
	}
	return logRequest;
}

export function logWorkerRequest({
	ctx,
	requestLog,
	statusCode,
	method,
	path,
	route,
	startedAt,
}: {
	ctx: Pick<BalanceWorkerHttpContext, "logger" | "requestLog">;
	requestLog: BalanceWorkerRequestLog;
	statusCode: number;
	method: string;
	path: string;
	route?: PartitionRoute;
	startedAt: number;
}): void {
	const { command, response, error, errorCode, batch } = requestLog;
	const severity = Math.max(statusCode, batch?.worstStatus ?? 0);
	if (severity < 400 && !(batch && batch.failed > 0) && !sampleSuccess({ ctx }))
		return;
	const identity = command?.identity ?? batch?.identity;
	const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
	const event = {
		event: "balance_worker.request",
		statusCode,
		durationMs,
		context: {
			org_id: identity?.orgId,
			org_slug: command?.org?.slug ?? batch?.orgSlug,
			env: identity?.env,
			customer_id: identity?.customerId,
			entity_id: identity?.entityId,
		},
		errorCode,
		error: error && loggedErrorOf({ error, statusCode }),
		req: {
			id: command?.requestId ?? requestLog.id,
			method,
			path,
			body:
				severity >= 400 && command ? loggedCommandOf({ command }) : undefined,
		},
		res: shouldLogResponse() ? (response ?? null) : undefined,
		data: {
			route: route ?? batch?.route,
			commandId: command?.commandId,
			featureId: command?.featureId,
			value: command?.value,
			batch: batch && loggedBatchOf({ batch }),
			...outcomeOf({ requestLog }),
		},
	};
	const message = `[${statusCode}] ${method} ${path} ${durationMs}ms${error ? ` — ${error.name}` : ""}`;
	const isActivating =
		!batch &&
		error instanceof OwnedPartitionNotReadyError &&
		error.status === "activating";
	if (severity >= 500 && !isActivating) ctx.logger.error(event, message);
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

function loggedErrorOf({
	error,
	statusCode,
}: {
	error: Error;
	statusCode: number;
}): Error | { name: string; message: string } {
	if (statusCode >= 500) return error;
	return { name: error.name, message: error.message };
}

function sampleSuccess({
	ctx,
}: {
	ctx: Pick<BalanceWorkerHttpContext, "requestLog">;
}): boolean {
	const rate = ctx.requestLog?.successSampleRate;
	if (rate === undefined || rate >= 1) return true;
	if (rate <= 0) return false;
	return Math.random() < rate;
}
function shouldLogResponse(): boolean {
	if (process.env.NODE_ENV !== "production") return true;
	return Math.random() < PRODUCTION_RESPONSE_SAMPLE_RATE;
}

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
	const result = response && "result" in response ? response.result : undefined;
	const trackResult =
		result &&
		"type" in result &&
		(result.type === "track" || result.type === "finalize")
			? result
			: undefined;
	const initializeResult = result && "duplicate" in result ? result : undefined;
	return {
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
