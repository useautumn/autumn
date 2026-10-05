import type { KafkaTokenInfo } from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import { createHttpWorkerPool } from "../../http/workerThreads/createHttpWorkerPool.js";
import type { HttpWorkerPoolConfig } from "../../http/workerThreads/types/httpWorkerPool.js";
import {
	createThreadedProducers,
	type ThreadedProducers,
	type ThreadedProducersConfig,
} from "../../kafka/producerThread/createThreadedProducers.js";
import type { WorkerListener } from "../types/balanceWorker.js";
import { connectHeldReplies } from "./connectHeldReplies.js";

/**
 * The HTTP worker threads first (they own the port), then the producer thread. A producer thread that cannot
 * start takes the HTTP threads down with it, so a task never serves with no way to commit. Stopping goes the
 * other way round: the HTTP threads finish their requests, then the producers disconnect.
 */
export async function listenThroughThreads({
	ctx,
	config,
}: {
	ctx: {
		fetch(request: Request): Response | Promise<Response>;
		logger: Pick<AutumnLogger, "warn" | "error">;
		/** A thread died: what it carried cannot be trusted, so the task is replaced. */
		onFatal(failure: {
			cause: unknown;
			scope: "http-workers" | "producer-thread";
		}): void;
		onToken(info: KafkaTokenInfo): void;
		/** Where held replies learn their fate: the commit positions, and how a failure is answered. */
		heldReplies?: Omit<Parameters<typeof connectHeldReplies>[0], "http">;
	};
	config: { http: HttpWorkerPoolConfig; producers: ThreadedProducersConfig };
}): Promise<{ listener: WorkerListener; producers: ThreadedProducers }> {
	function httpWorkersFailed({ cause }: { cause: unknown }): void {
		ctx.onFatal({ cause, scope: "http-workers" });
	}
	function producerThreadFailed({ cause }: { cause: unknown }): void {
		ctx.onFatal({ cause, scope: "producer-thread" });
	}
	const http = await createHttpWorkerPool({
		ctx: { fetch: ctx.fetch, logger: ctx.logger, onFatal: httpWorkersFailed },
		config: config.http,
	}).listen();
	const disconnectHeld = ctx.heldReplies
		? connectHeldReplies({ ...ctx.heldReplies, http })
		: null;
	const producers = createThreadedProducers({
		ctx: {
			logger: ctx.logger,
			onFatal: producerThreadFailed,
			onToken: ctx.onToken,
		},
		config: config.producers,
	});
	try {
		await producers.start();
	} catch (cause) {
		disconnectHeld?.();
		await http.stop();
		throw cause;
	}
	async function stop(): Promise<void> {
		try {
			// Partitions stopped first, so every held reply has had its commit or its failure.
			await http.stop();
			disconnectHeld?.();
		} finally {
			await producers.stop();
		}
	}
	return { listener: { stop }, producers };
}
