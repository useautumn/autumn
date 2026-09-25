import type { TrackCommand } from "@autumn/balance-engine";
import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import type { TrackReply } from "../contracts/track.js";
import type { TrackBatchItemResult } from "../contracts/trackBatch.js";
import {
	type HttpResponse,
	HttpResponseError,
} from "../http/types/httpClient.js";
import type { TrackParams } from "../types/balanceWorkerClient.js";
import {
	BalanceWorkerClientError,
	type WorkerRequestOutcome,
} from "../types/balanceWorkerClientErrors.js";
import { resolveCommandRoute } from "./resolveCommandRoute.js";
import type {
	RequestDeadline,
	ResolvedCommandRoute,
	RoutingContext,
} from "./types/routing.js";
import {
	assertRequestDeadline,
	createRequestDeadline,
	isNotOwnerResponse,
	refreshCommandRoute,
} from "./workerRequestPolicy.js";

export const DEFAULT_MAX_TRACK_BATCH_SIZE = 100;

/** Where a track stands: waiting for its partition, between routing attempts, on the wire, or answered. */
type TrackItemPhase = "queued" | "routing" | "sending" | "settled";

type TrackItem = {
	snapshot: TrackCommand;
	deadline: RequestDeadline;
	phase: TrackItemPhase;
	lane: PartitionLane;
	attempt?: BatchAttempt;
	resolve(reply: TrackReply): void;
	reject(error: unknown): void;
	onAbort(): void;
};

/** One partition's tracks: at most one batch in flight, the rest waiting for it to return. */
type PartitionLane = { queue: TrackItem[]; busy: boolean };

/** One routing-and-send of a batch. Its signal aborts once nobody is waiting on it. */
type BatchAttempt = { controller: AbortController; live: Set<TrackItem> };

/**
 * Tracks for one partition share one request: an idle partition sends at once as a
 * batch of one, and whatever arrives while that is in flight goes out together the
 * moment it returns. No timers, so an idle customer waits for nothing.
 */
export function createTrackBatcher({
	ctx,
	maxBatchSize = DEFAULT_MAX_TRACK_BATCH_SIZE,
}: {
	ctx: RoutingContext;
	maxBatchSize?: number;
}): { track(params: TrackParams): Promise<TrackReply> } {
	const lanes = new Map<number, PartitionLane>();

	function laneFor({ command }: { command: TrackCommand }): PartitionLane {
		const partition = meteringIdentityToPartition({
			identity: command.identity,
			partitionCount: ctx.partitionCount,
		});
		let lane = lanes.get(partition);
		if (!lane) {
			lane = { queue: [], busy: false };
			lanes.set(partition, lane);
		}
		return lane;
	}

	/** Always answers through the promise, never by throwing, like the single-request path. */
	function track(params: TrackParams): Promise<TrackReply> {
		try {
			return enqueueTrack(params);
		} catch (cause) {
			return Promise.reject(cause);
		}
	}

	function enqueueTrack({ command, signal }: TrackParams): Promise<TrackReply> {
		const settled = Promise.withResolvers<TrackReply>();
		const deadline = createRequestDeadline({
			timeoutMs: ctx.timeoutMs,
			signal,
		});
		assertRequestDeadline({ deadline, outcome: "not_submitted" });
		// The batch goes out later than the call, so it must not see caller mutations.
		const snapshot = structuredClone(command);
		const item: TrackItem = {
			snapshot,
			deadline,
			phase: "queued",
			lane: laneFor({ command: snapshot }),
			resolve: settled.resolve,
			reject: settled.reject,
			onAbort,
		};
		function onAbort(): void {
			abandonItem({ item });
		}
		deadline.signal.addEventListener("abort", onAbort, { once: true });
		item.lane.queue.push(item);
		if (!item.lane.busy) void drainLane({ lane: item.lane });
		return settled.promise;
	}

	async function drainLane({ lane }: { lane: PartitionLane }): Promise<void> {
		lane.busy = true;
		try {
			while (lane.queue.length > 0) {
				const items = lane.queue.splice(0, maxBatchSize);
				for (const item of items) item.phase = "routing";
				await sendBatch({ items });
			}
		} finally {
			lane.busy = false;
		}
	}

	async function sendBatch({ items }: { items: TrackItem[] }): Promise<void> {
		let pending = items;
		try {
			for (let attempt = 0; attempt < 2; attempt++) {
				pending = pending.filter(isLive);
				if (pending.length === 0) return;
				const batchAttempt = startAttempt({ items: pending });
				if (attempt > 0) {
					await refreshCommandRoute({
						owners: ctx.owners,
						deadline: attemptDeadline({ items: pending, batchAttempt }),
						timeoutMs: ctx.routeRefreshTimeoutMs,
					});
					pending = pending.filter(isLive);
					if (pending.length === 0) return;
				}
				const resolved = resolveCommandRoute({
					ctx,
					command: pending[0].snapshot,
				});
				if (!resolved) {
					if (attempt === 0) continue;
					rejectAll({
						items: pending,
						error: new BalanceWorkerClientError({
							code: "NO_OWNER",
							outcome: "not_submitted",
							message: "No worker owns the command partition",
						}),
					});
					return;
				}
				pending = await postBatch({
					items: pending,
					resolved,
					batchAttempt,
				});
			}
			rejectAll({
				items: pending,
				error: new BalanceWorkerClientError({
					code: "ROUTE_STILL_STALE",
					outcome: "not_submitted",
					message: "Worker route is still stale after refreshing ownership",
				}),
			});
		} catch (cause) {
			// Only routing throws here; nothing in `pending` is on the wire.
			rejectAll({
				items: pending,
				error:
					cause instanceof BalanceWorkerClientError
						? cause
						: new BalanceWorkerClientError({
								code: "OWNERSHIP_UNAVAILABLE",
								outcome: "not_submitted",
								message: "Worker request failed",
								cause,
							}),
			});
		}
	}

	/** Sends the live items and settles what the worker answered; returns the items to reroute. */
	async function postBatch({
		items,
		resolved,
		batchAttempt,
	}: {
		items: TrackItem[];
		resolved: ResolvedCommandRoute;
		batchAttempt: BatchAttempt;
	}): Promise<TrackItem[]> {
		for (const item of items) item.phase = "sending";
		let response: HttpResponse;
		try {
			response = await ctx.http.postJson({
				url: `${resolved.endpoint}/v1/track-batch`,
				body: {
					route: resolved.route,
					commands: items.map(snapshotOf),
				},
				signal: batchAttempt.controller.signal,
			});
		} catch (cause) {
			rejectAll({
				items,
				error: new BalanceWorkerClientError({
					code:
						cause instanceof HttpResponseError
							? "INVALID_RESPONSE"
							: "TRANSPORT",
					outcome: "unknown",
					message: "Worker request failed",
					cause,
				}),
			});
			return [];
		}
		// Answered: settling items from here on must not cancel anything.
		batchAttempt.live.clear();
		if (response.status !== 200) {
			if (
				!isNotOwner({ items, status: response.status, body: response.body })
			) {
				rejectAll({ items, error: invalidResponse({}) });
				return [];
			}
			for (const item of items) if (isLive(item)) item.phase = "routing";
			return items.filter(isLive);
		}
		const results = readResults({ body: response.body, count: items.length });
		if (!results) {
			rejectAll({ items, error: invalidResponse({}) });
			return [];
		}
		const reroute: TrackItem[] = [];
		for (const [index, item] of items.entries()) {
			const result = results[index];
			if (!isLive(item)) continue;
			if (result.ok) {
				settleReply({ item, reply: result.reply });
				continue;
			}
			if (
				isNotOwner({
					items: [item],
					status: result.status,
					body: { error: result.error },
				})
			) {
				item.phase = "routing";
				reroute.push(item);
			} else rejectAll({ items: [item], error: invalidResponse({}) });
		}
		return reroute;
	}

	/** Same reading as a single request: NOT_OWNER reroutes, any other worker error settles the items. */
	function isNotOwner({
		items,
		status,
		body,
	}: {
		items: TrackItem[];
		status: number;
		body: unknown;
	}): boolean {
		try {
			return isNotOwnerResponse({ response: { status, body } });
		} catch (cause) {
			rejectAll({
				items,
				error:
					cause instanceof BalanceWorkerClientError
						? cause
						: invalidResponse({ cause }),
			});
			return false;
		}
	}

	function settleReply({
		item,
		reply,
	}: {
		item: TrackItem;
		reply: TrackReply;
	}): void {
		// A reply that lands after the deadline is still uncertain to the caller, as for a single request.
		const late = deadlineErrorOf({ item, outcome: "unknown" });
		settleItem({ item });
		if (late) item.reject(late);
		else item.resolve(reply);
	}

	function rejectAll({
		items,
		error,
	}: {
		items: TrackItem[];
		error: unknown;
	}): void {
		for (const item of items) {
			if (!isLive(item)) continue;
			settleItem({ item });
			item.reject(error);
		}
	}

	/** The caller stopped waiting: a queued or rerouting item never reached a worker, a sent one may have. */
	function abandonItem({ item }: { item: TrackItem }): void {
		if (!isLive(item)) return;
		const outcome: WorkerRequestOutcome =
			item.phase === "sending" ? "unknown" : "not_submitted";
		if (item.phase === "queued") {
			const index = item.lane.queue.indexOf(item);
			if (index >= 0) item.lane.queue.splice(index, 1);
		}
		const error =
			deadlineErrorOf({ item, outcome }) ??
			new BalanceWorkerClientError({
				code: "ABORTED",
				outcome,
				message: "Worker request aborted",
			});
		settleItem({ item });
		item.reject(error);
	}

	function settleItem({ item }: { item: TrackItem }): void {
		item.phase = "settled";
		item.deadline.signal.removeEventListener("abort", item.onAbort);
		const attempt = item.attempt;
		if (!attempt?.live.delete(item)) return;
		if (attempt.live.size === 0) attempt.controller.abort();
	}

	function startAttempt({ items }: { items: TrackItem[] }): BatchAttempt {
		const batchAttempt: BatchAttempt = {
			controller: new AbortController(),
			live: new Set(items),
		};
		for (const item of items) item.attempt = batchAttempt;
		return batchAttempt;
	}

	return { track };
}

function snapshotOf(item: TrackItem): TrackCommand {
	return item.snapshot;
}

function isLive(item: TrackItem): boolean {
	return item.phase !== "settled";
}

/** A route refresh waits as long as any item in the batch still does. */
function attemptDeadline({
	items,
	batchAttempt,
}: {
	items: TrackItem[];
	batchAttempt: BatchAttempt;
}): RequestDeadline {
	let expiresAt = 0;
	for (const item of items)
		expiresAt = Math.max(expiresAt, item.deadline.expiresAt);
	return { signal: batchAttempt.controller.signal, expiresAt };
}

function deadlineErrorOf({
	item,
	outcome,
}: {
	item: TrackItem;
	outcome: WorkerRequestOutcome;
}): BalanceWorkerClientError | undefined {
	try {
		assertRequestDeadline({ deadline: item.deadline, outcome });
		return undefined;
	} catch (cause) {
		return cause as BalanceWorkerClientError;
	}
}

function invalidResponse({
	cause,
}: {
	cause?: unknown;
}): BalanceWorkerClientError {
	return new BalanceWorkerClientError({
		code: "INVALID_RESPONSE",
		outcome: "unknown",
		message: "Worker request failed",
		cause,
	});
}

/** One well-formed result per command, or nothing: a reply that miscounts cannot be matched to callers. */
function readResults({
	body,
	count,
}: {
	body: unknown;
	count: number;
}): TrackBatchItemResult[] | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const { results } = body as { results?: unknown };
	if (!Array.isArray(results) || results.length !== count) return undefined;
	for (const result of results) if (!isItemResult(result)) return undefined;
	return results as TrackBatchItemResult[];
}

function isItemResult(input: unknown): input is TrackBatchItemResult {
	if (typeof input !== "object" || input === null) return false;
	const result = input as Record<string, unknown>;
	if (result.ok === true)
		return typeof result.reply === "object" && result.reply !== null;
	return (
		result.ok === false &&
		typeof result.status === "number" &&
		typeof result.error === "object" &&
		result.error !== null
	);
}
