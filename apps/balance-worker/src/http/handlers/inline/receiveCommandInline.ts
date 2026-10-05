import type { CheckCommand, TrackCommand } from "@autumn/balance-engine";
import {
	parseWorkerRequest,
	type WorkerErrorResponse,
} from "@autumn/balance-worker-client/protocol";
import type { PartitionProcessor } from "../../../processor/types/partitionProcessor.js";
import { logWorkerRequest } from "../../middlewares/requestLoggingMiddleware.js";
import type { BalanceWorkerRequestLog } from "../../types/balanceWorkerHttp.js";
import type { InlineReply } from "../../workerThreads/types/inlineHandler.js";
import { workerErrorOf } from "../errorHandler/workerErrorOf.js";
import type { InlineHandlerContext } from "./types/inlineHandlerContext.js";

const decoder = new TextDecoder();

type InlineCommand = TrackCommand | CheckCommand;

/** The reply bytes, held until the commit position reaches `seq` (0 for at once); or why the ordinary route answers. */
type InlineDecision =
	| {
			kind: "decided";
			body: string;
			reply?: BalanceWorkerRequestLog["response"];
			seq: number;
	  }
	| { kind: "refused"; reason: string };

/** The envelope of one command of `type`; anything else is the ordinary route's to answer. */
function commandRequestOf<Command extends InlineCommand>({
	body,
	type,
}: {
	body: Uint8Array;
	type: Command["type"];
}) {
	try {
		const request = parseWorkerRequest({
			input: JSON.parse(decoder.decode(body)),
		});
		if ("payload" in request) return null;
		const command = request.command as Partial<Command> | null;
		if (command?.type !== type || !command.identity) return null;
		return { route: request.route, command: command as Command };
	} catch {
		return null;
	}
}

/**
 * One command decided inline on an owned, ready runtime. Null leaves it to the ordinary route: a malformed or
 * foreign envelope, a route not owned or not ready here, or a decide that needs the asynchronous path.
 */
export function receiveCommandInline<Command extends InlineCommand>({
	ctx,
	body,
	type,
	path,
	decide,
}: {
	ctx: InlineHandlerContext;
	body: Uint8Array;
	type: Command["type"];
	path: string;
	decide: (params: {
		processor: PartitionProcessor;
		command: Command;
	}) => InlineDecision;
}): InlineReply | null {
	function fallBack(reason: string): null {
		ctx.counters.fellBack({ name: type, reason });
		return null;
	}
	const parsed = commandRequestOf<Command>({ body, type });
	if (!parsed) return fallBack("envelope");
	const { route, command } = parsed;
	const partition = ctx.partitionResolver.partitionForIdentity({
		identity: command.identity,
	});
	if (partition !== route.partition) return fallBack("partition");
	const runtime = ctx.ownership.findRuntime(route);
	if (!runtime?.processInline) return fallBack("not_owned");
	const startedAt = performance.now();
	const requestLog: BalanceWorkerRequestLog = {
		id: crypto.randomUUID(),
		command,
	};
	let reply: InlineReply | null;
	try {
		const outcome = runtime.processInline((processor) =>
			decide({ processor, command }),
		);
		if (!outcome) return fallBack("not_ready");
		if (outcome.kind === "refused") return fallBack(outcome.reason);
		ctx.counters.answered({ name: type });
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
		path,
		route,
		startedAt,
	});
	return reply;
}
