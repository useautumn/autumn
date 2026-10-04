import type { TrackReply } from "@autumn/balance-worker-client";
import {
	type CheckReply,
	parseWorkerRequest,
	readRequestBudgetHeader,
	WORKER_REQUEST_BUDGET_HEADER,
	type WorkerErrorResponse,
	type WorkerRequest,
} from "@autumn/balance-worker-client/protocol";
import type { PartitionProcessor } from "../../processor/types/partitionProcessor.js";
import {
	isDeadlineShed,
	RequestAbandonedError,
} from "../../runtime/deadlineShed/deadlineShedErrors.js";
import { isPastCallerDeadline } from "../../runtime/deadlineShed/isPastCallerDeadline.js";
import {
	looksLikeCheckCommand,
	looksLikeTrackCommand,
} from "../commands/looksLikeCommands.js";
import { workerErrorOf } from "../handlers/errorHandler/workerErrorOf.js";
import {
	logWorkerRequest,
	nextRequestLogId,
} from "../middlewares/requestLoggingMiddleware.js";
import { resolveRequestRuntime } from "../middlewares/runtimeRouting/resolveRequestRuntime.js";
import { withRequestBudget } from "../middlewares/runtimeRouting/withRequestBudget.js";
import {
	serializeCheckReply,
	serializeSubjectReply,
} from "../replies/serializeSubjectReply.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestLog,
} from "../types/balanceWorkerHttp.js";

type Fetch = (request: Request) => Response | Promise<Response>;

const JSON_HEADERS = { "content-type": "application/json" };

type FastReply = TrackReply | CheckReply;

type FastRoute = {
	accepts(input: unknown): boolean;
	run(processor: PartitionProcessor, command: unknown): Promise<FastReply>;
	serialize(reply: FastReply): string;
};

/** The two hot routes: what each runs on the partition and how its reply is written. */
const FAST_ROUTES: Record<"/v1/track" | "/v1/check", FastRoute> = {
	"/v1/track": {
		accepts: looksLikeTrackCommand,
		run: (processor: PartitionProcessor, command: unknown) =>
			processor.track({ command: command as never }),
		serialize: (reply) => serializeSubjectReply({ reply }),
	},
	"/v1/check": {
		accepts: looksLikeCheckCommand,
		run: (processor: PartitionProcessor, command: unknown) =>
			processor.check({ command: command as never }),
		serialize: (reply) => serializeCheckReply({ reply: reply as CheckReply }),
	},
};

type FastPath = keyof typeof FAST_ROUTES;

/** The path of an absolute request URL, without parsing it into a URL object. */
function pathOf(url: string): string {
	const start = url.indexOf("/", url.indexOf("//") + 2);
	if (start === -1) return "/";
	const query = url.indexOf("?", start);
	return query === -1 ? url.slice(start) : url.slice(start, query);
}

function isFastPath(path: string): path is FastPath {
	return path === "/v1/track" || path === "/v1/check";
}

function isJson(request: Request): boolean {
	return (
		request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ===
		"application/json"
	);
}

/**
 * Track and check skip the router and its middleware: one switch on the path, the envelope parsed once,
 * the reply written as a string. Anything unusual (not JSON, a bad envelope, not shaped like the command)
 * goes to the full app, which answers it exactly as before; so do every other route and method.
 */
export function createBalanceWorkerFetch({
	ctx,
	app,
}: {
	ctx: BalanceWorkerHttpContext;
	app: { fetch: Fetch };
}): Fetch {
	function fetch(request: Request): Response | Promise<Response> {
		if (request.method !== "POST" || !isJson(request))
			return app.fetch(request);
		const path = pathOf(request.url);
		if (!isFastPath(path)) return app.fetch(request);
		if (isPastCallerDeadline({ headers: request.headers }))
			return answerAbandoned({ request, path });
		return answerFast({ request, path });
	}

	/** Arm B: the caller gave up before the worker read the request, so its body is never read. */
	function answerAbandoned({
		request,
		path,
	}: {
		request: Request;
		path: FastPath;
	}): Response {
		const requestLog: BalanceWorkerRequestLog = { id: nextRequestLogId() };
		const response = errorResponseOf({
			cause: new RequestAbandonedError(),
			requestLog,
		});
		logWorkerRequest({
			ctx,
			requestLog,
			statusCode: response.status,
			method: request.method,
			path,
			route: undefined,
			startedAt: performance.now(),
		});
		return response;
	}

	async function answerFast({
		request,
		path,
	}: {
		request: Request;
		path: FastPath;
	}): Promise<Response> {
		const body = await request.text();
		const parsed = parseFastRequest({ body, path });
		// The body is spent, so the full app gets the same request rebuilt around it.
		if (!parsed)
			return app.fetch(
				new Request(request.url, {
					method: request.method,
					headers: request.headers,
					body,
				}),
			);
		const route = FAST_ROUTES[path];
		const requestLog: BalanceWorkerRequestLog = { id: nextRequestLogId() };
		const startedAt = performance.now();
		let response: Response;
		try {
			const runtime = withRequestBudget({
				runtime: await resolveRequestRuntime({
					ctx,
					route: parsed.route,
					command: parsed.command,
				}),
				budgetMs: readRequestBudgetHeader({
					value: request.headers.get(WORKER_REQUEST_BUDGET_HEADER) ?? undefined,
				}),
			});
			requestLog.command = parsed.command as BalanceWorkerRequestLog["command"];
			const reply = await runtime.process<FastReply>((processor) =>
				route.run(processor, parsed.command),
			);
			requestLog.response = reply;
			response = new Response(route.serialize(reply), {
				status: 200,
				headers: JSON_HEADERS,
			});
		} catch (cause) {
			response = errorResponseOf({ cause, requestLog });
		}
		logWorkerRequest({
			ctx,
			requestLog,
			statusCode: response.status,
			method: request.method,
			path,
			route: parsed.route,
			startedAt,
		});
		return response;
	}

	return fetch;
}

function parseFastRequest({
	body,
	path,
}: {
	body: string;
	path: FastPath;
}): WorkerRequest | null {
	try {
		const parsed = parseWorkerRequest({ input: JSON.parse(body) });
		if ("payload" in parsed) return null;
		return FAST_ROUTES[path].accepts(parsed.command) ? parsed : null;
	} catch {
		return null;
	}
}

/** What the app's error handler answers, and what it records for the log line. */
function errorResponseOf({
	cause,
	requestLog,
}: {
	cause: unknown;
	requestLog: BalanceWorkerRequestLog;
}): Response {
	const { status, error } = workerErrorOf({ cause: cause as Error });
	// Overload arrives in floods; a stack per rejection cost more than accepting the request did.
	if (isDeadlineShed(cause)) requestLog.shed = true;
	else if (error.code !== "OVERLOADED") requestLog.error = cause as Error;
	requestLog.errorCode = error.code;
	return new Response(JSON.stringify({ error } satisfies WorkerErrorResponse), {
		status,
		headers: JSON_HEADERS,
	});
}
