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

export async function startWorkerThreads({
	ctx,
	config,
}: {
	ctx: {
		fetch(request: Request): Response | Promise<Response>;
		logger: Pick<AutumnLogger, "warn" | "error">;
		onFatal(failure: {
			cause: unknown;
			scope: "http-workers" | "producer-thread";
		}): void;
		onToken(info: KafkaTokenInfo): void;
		heldReplies?: Omit<Parameters<typeof connectHeldReplies>[0], "http">;
	};
	config: { http: HttpWorkerPoolConfig; producers: ThreadedProducersConfig };
}): Promise<{
	listener: WorkerListener;
	producers: ThreadedProducers;
	drainThreadSignals(): {
		threads: Record<string, number>;
		latencyMs: Record<string, unknown>;
	};
}> {
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
			await http.stop();
			disconnectHeld?.();
		} finally {
			await producers.stop();
		}
	}
	function drainThreadSignals() {
		return {
			threads: { ...http.drainHealth(), ...producers.drainHealth() },
			latencyMs: http.drainLatencies(),
		};
	}
	return { listener: { stop }, producers, drainThreadSignals };
}
