import type { TrackCommand } from "@autumn/balance-engine";
import {
	parseWorkerRequest,
	type WorkerErrorResponse,
} from "@autumn/balance-worker-client/protocol";
import { logWorkerRequest } from "../../middlewares/requestLoggingMiddleware.js";
import type { BalanceWorkerRequestLog } from "../../types/balanceWorkerHttp.js";
import type { InlineReply } from "../../workerThreads/types/inlineHandler.js";
import { workerErrorOf } from "../errorHandler/workerErrorOf.js";
import type { InlineHandlerContext } from "./types/inlineHandlerContext.js";

const decoder = new TextDecoder();

/** The envelope of a single track; anything else is the ordinary route's to answer. */
function trackRequestOf({ body }: { body: Uint8Array }) {
	try {
		const request = parseWorkerRequest({
			input: JSON.parse(decoder.decode(body)),
		});
		if ("payload" in request) return null;
		const command = request.command as Partial<TrackCommand> | null;
		if (command?.type !== "track" || !command.identity) return null;
		return { route: request.route, command: command as TrackCommand };
	} catch {
		return null;
	}
}

/**
 * `/v1/track` decided inline on an owned, ready runtime; its reply is held until the log has the write.
 * Null leaves it to the ordinary route: a malformed or foreign envelope, a route not owned or not ready here,
 * or a customer that needs the asynchronous ensure.
 */
export function receiveTrackInline({
	ctx,
	body,
}: {
	ctx: InlineHandlerContext;
	body: Uint8Array;
}): InlineReply | null {
	const parsed = trackRequestOf({ body });
	if (!parsed) return null;
	const { route, command } = parsed;
	const partition = ctx.partitionResolver.partitionForIdentity({
		identity: command.identity,
	});
	if (partition !== route.partition) return null;
	const runtime = ctx.ownership.findRuntime(route);
	if (!runtime?.processInline) return null;
	const startedAt = performance.now();
	const requestLog: BalanceWorkerRequestLog = {
		id: crypto.randomUUID(),
		command,
	};
	let reply: InlineReply | null;
	try {
		const outcome = runtime.processInline((processor) =>
			processor.trackInline({ command }),
		);
		if (!outcome) return null;
		requestLog.response = outcome.reply;
		reply = {
			status: 200,
			body: outcome.body,
			partition,
			heldUntilSeq: outcome.seq,
		};
	} catch (cause) {
		const { status, error } = workerErrorOf({ cause });
		if (error.code !== "OVERLOADED") requestLog.error = cause as Error;
		requestLog.errorCode = error.code;
		reply = {
			status,
			body: JSON.stringify({ error } satisfies WorkerErrorResponse),
			partition,
			heldUntilSeq: 0,
		};
	}
	logWorkerRequest({
		ctx,
		requestLog,
		statusCode: reply.status,
		method: "POST",
		path: "/v1/track",
		route,
		startedAt,
	});
	return reply;
}
