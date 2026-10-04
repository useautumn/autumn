/**
 * The main thread's hot decider (serial-decide arm D): a track that arrives as a HOT frame is parsed,
 * routed and decided here synchronously, its reply handed back with the sequence number the I/O worker
 * holds it on. Null means the request is not for the hot path and the pool answers it through the
 * ordinary fetch: not a track, a malformed envelope, a route this task does not own or that is still
 * activating, a subject that needs an asynchronous ensure, or a customer with a classic command in flight.
 */
import type { TrackCommand } from "@autumn/balance-engine";
import {
	type PartitionRoute,
	parseWorkerRequest,
	type WorkerErrorResponse,
} from "@autumn/balance-worker-client/protocol";
import { looksLikeTrackCommand } from "../http/commands/looksLikeCommands.js";
import { workerErrorOf } from "../http/handlers/errorHandler/workerErrorOf.js";
import {
	logWorkerRequest,
	nextRequestLogId,
} from "../http/middlewares/requestLoggingMiddleware.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestLog,
} from "../http/types/balanceWorkerHttp.js";
import type { PartitionProcessor } from "../processor/types/partitionProcessor.js";
import {
	HOT_KIND,
	type HotDecider,
	type HotOutcome,
	type HotRequest,
} from "./hotProtocol.js";

const decoder = new TextDecoder();

export function createHotDecider({
	ctx,
	config,
}: {
	ctx: BalanceWorkerHttpContext;
	config: { partitionCount: number };
}): HotDecider {
	function decide(request: HotRequest): HotOutcome | null {
		if (request.kind !== HOT_KIND.TRACK) return null;
		const parsed = parseTrack({ body: request.body });
		if (!parsed) return null;
		const { route, command } = parsed;
		const partition = ctx.partitionResolver.partitionForIdentity({
			identity: command.identity,
		});
		if (partition !== route.partition) return null;
		const runtime = ctx.ownership.findRuntime(route);
		if (!runtime?.processHot) return null;
		const requestLog: BalanceWorkerRequestLog = { id: nextRequestLogId() };
		const startedAt = performance.now();
		let outcome: HotOutcome;
		try {
			const hot = runtime.processHot((processor: PartitionProcessor) =>
				processor.trackHot({ command }),
			);
			if (!hot) return null;
			requestLog.command = command;
			requestLog.response = hot.reply;
			outcome = { status: hot.status, body: hot.body, partition, seq: hot.seq };
		} catch (cause) {
			requestLog.command = command;
			outcome = errorOutcomeOf({ cause, requestLog, partition });
		}
		logWorkerRequest({
			ctx,
			requestLog,
			statusCode: outcome.status,
			method: "POST",
			path: "/v1/track",
			route,
			startedAt,
		});
		return outcome;
	}

	return { decide, partitionCount: config.partitionCount };
}

function parseTrack({
	body,
}: {
	body: Uint8Array;
}): { route: PartitionRoute; command: TrackCommand } | null {
	try {
		const parsed = parseWorkerRequest({
			input: JSON.parse(decoder.decode(body)),
		});
		if ("payload" in parsed) return null;
		if (!looksLikeTrackCommand(parsed.command)) return null;
		return { route: parsed.route, command: parsed.command as TrackCommand };
	} catch {
		return null;
	}
}

/** What the fast path's error handler answers, and what it records for the log line. */
function errorOutcomeOf({
	cause,
	requestLog,
	partition,
}: {
	cause: unknown;
	requestLog: BalanceWorkerRequestLog;
	partition: number;
}): HotOutcome {
	const { status, error } = workerErrorOf({ cause: cause as Error });
	if (error.code !== "OVERLOADED") requestLog.error = cause as Error;
	requestLog.errorCode = error.code;
	return {
		status,
		body: JSON.stringify({ error } satisfies WorkerErrorResponse),
		partition,
		seq: 0,
	};
}
