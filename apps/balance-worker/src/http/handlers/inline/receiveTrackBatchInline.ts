import type { TrackCommand } from "@autumn/balance-engine";
import { parseTrackBatchRequest } from "@autumn/balance-worker-client/protocol";
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
	let reply: InlineReply;
	try {
		const decided = runtime.processInline((processor) =>
			processor.trackBatchInline({ commands }),
		);
		if (!decided || decided.kind === "refused") return null;
		const results: Parameters<typeof recordBatch>[0]["results"] = [];
		const json: string[] = [];
		const causes: unknown[] = [];
		for (const item of decided.items) {
			if (item.ok) {
				results.push({ ok: true });
				json.push(`{"ok":true,"reply":${item.body}}`);
				continue;
			}
			causes.push(item.cause);
			const { status, error } = workerErrorOf({ cause: item.cause });
			const failed = { ok: false as const, status, error };
			results.push(failed);
			json.push(JSON.stringify(failed));
		}
		recordBatch({ requestLog, route, commands, results, causes });
		reply = {
			status: 200,
			body: batchBodyOf({ results: json }),
			partition: route.partition,
			heldUntilSeq: decided.seq,
		};
	} catch (cause) {
		const { status, error } = workerErrorOf({ cause });
		requestLog.error = cause as Error;
		requestLog.errorCode = error.code;
		reply = {
			status,
			body: JSON.stringify({ error }),
			partition: route.partition,
			heldUntilSeq: 0,
		};
	}
	logWorkerRequest({
		ctx,
		requestLog,
		statusCode: reply.status,
		method: "POST",
		path: "/v1/track-batch",
		route,
		startedAt,
	});
	return reply;
}
