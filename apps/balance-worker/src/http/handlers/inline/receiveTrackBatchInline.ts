import type { TrackCommand } from "@autumn/balance-engine";
import { parseTrackBatchRequest } from "@autumn/balance-worker-client/protocol";
import type { InlineTrackBatchItem } from "../../../processor/commands/trackBatchInline.js";
import type { PartitionProcessor } from "../../../processor/types/partitionProcessor.js";
import { logWorkerRequest } from "../../middlewares/requestLoggingMiddleware.js";
import type { BalanceWorkerRequestLog } from "../../types/balanceWorkerHttp.js";
import type { InlineReply } from "../../workerThreads/types/inlineHandler.js";
import { workerErrorOf } from "../errorHandler/workerErrorOf.js";
import { looksLikeTrackCommand, recordBatch } from "../receiveTrackBatch.js";
import type { InlineHandlerContext } from "./types/inlineHandlerContext.js";

const decoder = new TextDecoder();
/** One append carries the whole batch; half the writer's byte cut keeps it far under Kafka's message cap. */
const MAX_BATCH_BODY_BYTES = 400_000;

/** A batch whose every command is shaped like a track for the route's partition; anything else is the ordinary route's. */
function trackBatchOf({
	ctx,
	body,
}: {
	ctx: InlineHandlerContext;
	body: Uint8Array;
}) {
	if (body.byteLength > MAX_BATCH_BODY_BYTES) return null;
	try {
		const { route, commands } = parseTrackBatchRequest({
			input: JSON.parse(decoder.decode(body)),
		});
		for (const command of commands) {
			if (!looksLikeTrackCommand(command)) return null;
			const partition = ctx.partitionResolver.partitionForIdentity({
				identity: command.identity,
			});
			if (partition !== route.partition) return null;
		}
		return { route, commands: commands as TrackCommand[] };
	} catch {
		return null;
	}
}

/** Exactly the ordinary batch reply: each command's reply bytes are the ones the held decide serialised. */
function batchBodyOf({ results }: { results: string[] }): string {
	return `{"results":[${results.join(",")}]}`;
}

/** `/v1/track-batch` decided inline as one held group, or handed to the ordinary route whole. */
export function receiveTrackBatchInline({
	ctx,
	body,
}: {
	ctx: InlineHandlerContext;
	body: Uint8Array;
}): InlineReply | null {
	const parsed = trackBatchOf({ ctx, body });
	if (!parsed) return null;
	const { route, commands } = parsed;
	const runtime = ctx.ownership.findRuntime(route);
	if (!runtime?.processInline) return null;
	const startedAt = performance.now();
	const requestLog: BalanceWorkerRequestLog = { id: crypto.randomUUID() };
	function logged(status: number): void {
		logWorkerRequest({
			ctx,
			requestLog,
			statusCode: status,
			method: "POST",
			path: "/v1/track-batch",
			route,
			startedAt,
		});
	}
	let decided: ReturnType<PartitionProcessor["trackBatchInline"]> | null;
	try {
		decided = runtime.processInline((processor) =>
			processor.trackBatchInline({ commands }),
		);
	} catch (cause) {
		const { status, error } = workerErrorOf({ cause });
		requestLog.error = cause as Error;
		requestLog.errorCode = error.code;
		logged(status);
		return {
			status,
			body: JSON.stringify({ error }),
			partition: route.partition,
			heldUntilSeq: 0,
		};
	}
	if (!decided || decided.kind === "refused") return null;
	const { items, commits, seq } = decided;
	function answer(commitFailures: (unknown | null)[]): string {
		const body = batchReplyOf({ items, commitFailures });
		recordBatch({ requestLog, route, commands, ...body });
		logged(200);
		return body.json;
	}
	if (!commits)
		return {
			status: 200,
			body: answer(items.map(() => null)),
			partition: route.partition,
			heldUntilSeq: seq,
		};
	// Split over appends: each command is answered by its own commit, as on the ordinary route.
	const landing = commits;
	async function answerWhenLanded() {
		const settled = await Promise.allSettled(
			landing.map((commit) => commit ?? Promise.resolve()),
		);
		const failures = settled.map((outcome) =>
			outcome.status === "rejected" ? outcome.reason : null,
		);
		return { status: 200, body: answer(failures) };
	}
	return { later: answerWhenLanded() };
}

/** The ordinary batch reply: each success carries the bytes the held decide serialised. */
function batchReplyOf({
	items,
	commitFailures,
}: {
	items: InlineTrackBatchItem[];
	commitFailures: (unknown | null)[];
}) {
	const results: Parameters<typeof recordBatch>[0]["results"] = [];
	const parts: string[] = [];
	const causes: unknown[] = [];
	for (const [index, item] of items.entries()) {
		const cause = item.ok ? commitFailures[index] : item.cause;
		if (item.ok && cause === null) {
			results.push({ ok: true });
			parts.push(`{"ok":true,"reply":${item.body}}`);
			continue;
		}
		causes.push(cause);
		const { status, error } = workerErrorOf({ cause });
		const failed = { ok: false as const, status, error };
		results.push(failed);
		parts.push(JSON.stringify(failed));
	}
	return { results, causes, json: batchBodyOf({ results: parts }) };
}
