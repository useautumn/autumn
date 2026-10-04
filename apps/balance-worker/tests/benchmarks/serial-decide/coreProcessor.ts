/**
 * Core A: today's processor, end to end, on the sequencer thread. `processor.track()` keeps its run
 * queue, writer settlements and commit loop; only HTTP, Kafka and the request log have left the thread.
 * The writer's `appendCommitted` hands each finished batch to the Kafka worker and awaits its ack.
 */
import type { TrackReply } from "@autumn/balance-worker-client";
import type {
	CheckReply,
	PartitionRoute,
	WorkerErrorResponse,
} from "@autumn/balance-worker-client/protocol";
import { serializeMeteringRecord } from "@autumn/kafka";
import {
	looksLikeCheckCommand,
	looksLikeTrackCommand,
} from "../../../src/http/commands/looksLikeCommands.js";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import { resolveRequestRuntime } from "../../../src/http/middlewares/runtimeRouting/resolveRequestRuntime.js";
import { withRequestBudget } from "../../../src/http/middlewares/runtimeRouting/withRequestBudget.js";
import {
	serializeCheckReply,
	serializeSubjectReply,
} from "../../../src/http/replies/serializeSubjectReply.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { createSpikeWorker } from "../rust-front/createSpikeWorker.js";
import { KIND } from "./protocol.js";
import type { Command, Core, Outcome, RecordAppender } from "./sequencer.js";

const INVALID = JSON.stringify({
	error: { code: "INVALID_REQUEST", message: "Invalid request" },
} satisfies WorkerErrorResponse);

type Reply = TrackReply | CheckReply;

export async function createProcessorCore({
	appender,
	appenderMode,
}: {
	appender: RecordAppender;
	appenderMode: "kafka" | "sim";
}): Promise<Core> {
	const worker = await createSpikeWorker({
		appenderMode: "remote",
		remoteAppend: async ({ records }) => {
			const { committed } = appender.append({ records });
			return committed;
		},
	});
	void appenderMode;
	const routes: Record<
		number,
		{
			path: string;
			accepts(input: unknown): boolean;
			run(p: PartitionProcessor, c: unknown): Promise<Reply>;
			serialize(r: Reply): string;
		}
	> = {
		[KIND.TRACK]: {
			path: "/v1/track",
			accepts: looksLikeTrackCommand,
			run: (processor, command) =>
				processor.track({ command: command as never }),
			serialize: (reply) => serializeSubjectReply({ reply }),
		},
		[KIND.CHECK]: {
			path: "/v1/check",
			accepts: looksLikeCheckCommand,
			run: (processor, command) =>
				processor.check({ command: command as never }),
			serialize: (reply) => serializeCheckReply({ reply: reply as CheckReply }),
		},
	};
	const route: PartitionRoute = {
		partition: 0,
		routeEpoch: "1",
	} as PartitionRoute;
	const stats = { tracks: 0, checks: 0, invalid: 0, failed: 0 };

	async function decide(command: Command): Promise<Outcome> {
		const handler = routes[command.kind];
		let parsed: { command?: unknown } | undefined;
		try {
			parsed = JSON.parse(command.text);
		} catch {
			parsed = undefined;
		}
		const input = parsed?.command;
		if (!handler || !handler.accepts(input)) {
			stats.invalid++;
			return { status: 400, body: INVALID, seq: 0 };
		}
		if (command.kind === KIND.TRACK) stats.tracks++;
		else stats.checks++;
		try {
			const runtime = withRequestBudget({
				runtime: await resolveRequestRuntime({
					ctx: worker.ctx,
					route,
					command: input,
				}),
				budgetMs: command.budgetMs === 0 ? undefined : command.budgetMs,
			});
			const reply = await runtime.process<Reply>((processor) =>
				handler.run(processor, input),
			);
			// The processor answered after its record committed, so the reply is releasable at once.
			return { status: 200, body: handler.serialize(reply), seq: 0 };
		} catch (cause) {
			stats.failed++;
			const { status, error } = workerErrorOf({ cause: cause as Error });
			return {
				status,
				body: JSON.stringify({ error } satisfies WorkerErrorResponse),
				seq: 0,
			};
		}
	}

	return {
		decide,
		onAck: () => undefined,
		stats: () => ({ ...stats }),
	};
}

export { serializeMeteringRecord };
