/**
 * The main thread's hot decider (serial-decide arm D): a track or check that arrives as a HOT frame is
 * parsed, routed and decided here synchronously; a track's reply is handed back with the sequence number
 * the I/O worker holds it on, a check's goes out at once. A track batch is decided whole and its reply held on
 * its last write. Null means the request is not for the hot path and the pool answers it through the ordinary
 * fetch: a malformed envelope, a route this task does not own or that is still activating, a subject that
 * needs an asynchronous ensure, or a customer with a classic command in flight. Every outcome is counted.
 */
import type { CheckCommand, TrackCommand } from "@autumn/balance-engine";
import {
	type PartitionRoute,
	parseTrackBatchRequest,
	parseWorkerRequest,
	type TrackBatchItemResult,
	type WorkerErrorResponse,
} from "@autumn/balance-worker-client/protocol";
import {
	looksLikeCheckCommand,
	looksLikeTrackCommand,
} from "../http/commands/looksLikeCommands.js";
import { workerErrorOf } from "../http/handlers/errorHandler/workerErrorOf.js";
import { recordBatch } from "../http/handlers/receiveTrackBatch.js";
import {
	logWorkerRequest,
	nextRequestLogId,
} from "../http/middlewares/requestLoggingMiddleware.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestLog,
} from "../http/types/balanceWorkerHttp.js";
import type { HotTrackBatchItem } from "../processor/commands/trackBatchHot.js";
import type { PartitionProcessor } from "../processor/types/partitionProcessor.js";
import {
	HOT_KIND,
	type HotDecider,
	type HotDeciderStats,
	type HotKind,
	type HotOutcome,
	type HotRequest,
} from "./hotProtocol.js";

const decoder = new TextDecoder();
/** A hot batch goes out as one append, which may pass the writer's byte cut; half that cut keeps it far under Kafka's 1 MiB message cap. */
export const MAX_HOT_BATCH_BODY_BYTES = 400_000;

type HotCommand =
	| { kind: typeof HOT_KIND.TRACK; path: "/v1/track"; command: TrackCommand }
	| { kind: typeof HOT_KIND.CHECK; path: "/v1/check"; command: CheckCommand };

export function createHotDecider({
	ctx,
	config,
}: {
	ctx: BalanceWorkerHttpContext;
	config: { partitionCount: number };
}): HotDecider {
	let stats = emptyStats();

	function decide(request: HotRequest): HotOutcome | null {
		if (request.kind === HOT_KIND.TRACK_BATCH) return decideBatch(request);
		const outcome = decideOne(request);
		countOne({ kind: request.kind, outcome });
		return outcome;
	}

	function countOne({
		kind,
		outcome,
	}: {
		kind: HotKind;
		outcome: HotOutcome | null;
	}): void {
		const isTrack = kind === HOT_KIND.TRACK;
		if (outcome && isTrack) stats.tracks++;
		else if (outcome) stats.checks++;
		else if (isTrack) stats.fallbackTracks++;
		else stats.fallbackChecks++;
	}

	function fallBack(reason: string): null {
		stats.fallbackBatches[reason] = (stats.fallbackBatches[reason] ?? 0) + 1;
		return null;
	}

	function decideBatch(request: HotRequest): HotOutcome | null {
		if (request.body.byteLength > MAX_HOT_BATCH_BODY_BYTES)
			return fallBack("too_large");
		const parsed = parseBatch({ body: request.body });
		if (!parsed) return fallBack("malformed");
		const { route, commands } = parsed;
		for (const command of commands) {
			const partition = ctx.partitionResolver.partitionForIdentity({
				identity: command.identity,
			});
			if (partition !== route.partition) return fallBack("route_mismatch");
		}
		const runtime = ctx.ownership.findRuntime(route);
		if (!runtime?.processHot) return fallBack("not_owned");
		const requestLog: BalanceWorkerRequestLog = { id: nextRequestLogId() };
		const startedAt = performance.now();
		let outcome: HotOutcome;
		try {
			const decided = runtime.processHot((processor: PartitionProcessor) =>
				processor.trackBatchHot({ commands }),
			);
			if (!decided) return fallBack("not_ready");
			if (decided.kind === "refused") return fallBack(decided.reason);
			const results = decided.items.map(resultOf);
			recordBatch({
				requestLog,
				route,
				commands,
				results: results.map(({ result }) => result),
				causes: decided.items.flatMap(causeOf),
			});
			outcome = {
				status: 200,
				body: batchBodyOf({ results }),
				partition: route.partition,
				seq: decided.seq,
			};
			stats.trackBatches++;
			stats.batchItems += commands.length;
		} catch (cause) {
			outcome = errorOutcomeOf({
				cause,
				requestLog,
				partition: route.partition,
			});
		}
		logWorkerRequest({
			ctx,
			requestLog,
			statusCode: outcome.status,
			method: "POST",
			path: "/v1/track-batch",
			route,
			startedAt,
		});
		return outcome;
	}

	function drainStats(): HotDeciderStats {
		const drained = stats;
		stats = emptyStats();
		return drained;
	}

	function decideOne(request: HotRequest): HotOutcome | null {
		const parsed = parseHot({ kind: request.kind, body: request.body });
		if (!parsed) return null;
		const { route, hot: hotCommand } = parsed;
		const { command } = hotCommand;
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
				hotCommand.kind === HOT_KIND.TRACK
					? processor.trackHot({ command: hotCommand.command })
					: processor.checkHot({ command: hotCommand.command }),
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
			path: hotCommand.path,
			route,
			startedAt,
		});
		return outcome;
	}

	return { decide, drainStats, partitionCount: config.partitionCount };
}

function emptyStats(): HotDeciderStats {
	return {
		tracks: 0,
		checks: 0,
		trackBatches: 0,
		batchItems: 0,
		fallbackTracks: 0,
		fallbackChecks: 0,
		fallbackBatches: {},
	};
}

/** A batch command's reply bytes, or its error as the ordinary batch handler renders it. */
function resultOf(item: HotTrackBatchItem): {
	result: { ok: true } | Extract<TrackBatchItemResult, { ok: false }>;
	json: string;
} {
	if (item.ok)
		return { result: { ok: true }, json: `{"ok":true,"reply":${item.body}}` };
	const { status, error } = workerErrorOf({ cause: item.cause as Error });
	const result = { ok: false as const, status, error };
	return { result, json: JSON.stringify(result) };
}

function causeOf(item: HotTrackBatchItem): unknown[] {
	return item.ok ? [] : [item.cause];
}

/** Exactly `serializeTrackBatchReply`: each reply's bytes are the ones the hot decide serialised. */
function batchBodyOf({ results }: { results: { json: string }[] }): string {
	return `{"results":[${results.map(({ json }) => json).join(",")}]}`;
}

/** A batch whose commands are all shaped like tracks; anything else is the ordinary path's to answer per command. */
function parseBatch({
	body,
}: {
	body: Uint8Array;
}): { route: PartitionRoute; commands: TrackCommand[] } | null {
	try {
		const { route, commands } = parseTrackBatchRequest({
			input: JSON.parse(decoder.decode(body)),
		});
		if (!commands.every(looksLikeTrackCommand)) return null;
		return { route, commands: commands as TrackCommand[] };
	} catch {
		return null;
	}
}

/** The envelope of a track or a check; anything else, a batch included, is the ordinary path's. */
function parseHot({
	kind,
	body,
}: {
	kind: HotKind;
	body: Uint8Array;
}): { route: PartitionRoute; hot: HotCommand } | null {
	if (kind !== HOT_KIND.TRACK && kind !== HOT_KIND.CHECK) return null;
	try {
		const parsed = parseWorkerRequest({
			input: JSON.parse(decoder.decode(body)),
		});
		if ("payload" in parsed) return null;
		const { route, command } = parsed;
		if (kind === HOT_KIND.TRACK)
			return looksLikeTrackCommand(command)
				? { route, hot: { kind, path: "/v1/track", command } }
				: null;
		return looksLikeCheckCommand(command)
			? { route, hot: { kind, path: "/v1/check", command } }
			: null;
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
