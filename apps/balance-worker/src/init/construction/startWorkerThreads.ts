import type { AutumnLogger } from "@autumn/logging";
import { createHttpWorkerPool } from "../../http/workerThreads/createHttpWorkerPool.js";
import type { HttpWorkerPoolConfig } from "../../http/workerThreads/types/httpWorkerPool.js";
import type { WorkerListener } from "../types/balanceWorker.js";
import { connectHeldReplies } from "./connectHeldReplies.js";

/** The HTTP worker threads own the port; a thread that dies takes the task with it, so it is replaced. */
export async function startWorkerThreads({
	ctx,
	config,
}: {
	ctx: {
		fetch(request: Request): Response | Promise<Response>;
		logger: Pick<AutumnLogger, "warn" | "error">;
		/** A thread died: what it carried cannot be trusted, so the task is replaced. */
		onFatal(failure: { cause: unknown; scope: "http-workers" }): void;
		/** Where held replies learn their fate: the commit positions, and how a failure is answered. */
		heldReplies?: Omit<Parameters<typeof connectHeldReplies>[0], "http">;
	};
	config: { http: HttpWorkerPoolConfig };
}): Promise<{
	listener: WorkerListener;
	/** The threads' window for the summary line, reset by the read: health counts and in-worker latency. */
	drainThreadSignals(): {
		threads: Record<string, number>;
		latencyMs: Record<string, unknown>;
	};
}> {
	function httpWorkersFailed({ cause }: { cause: unknown }): void {
		ctx.onFatal({ cause, scope: "http-workers" });
	}
	const http = await createHttpWorkerPool({
		ctx: { fetch: ctx.fetch, logger: ctx.logger, onFatal: httpWorkersFailed },
		config: config.http,
	}).listen();
	const disconnectHeld = ctx.heldReplies
		? connectHeldReplies({ ...ctx.heldReplies, http })
		: null;
	async function stop(): Promise<void> {
		// Partitions stopped first, so every held reply has had its commit or its failure.
		await http.stop();
		disconnectHeld?.();
	}
	function drainThreadSignals() {
		return { threads: http.drainHealth(), latencyMs: http.drainLatencies() };
	}
	return { listener: { stop }, drainThreadSignals };
}
