import type cluster from "node:cluster";
import type { Worker } from "node:cluster";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createRecycleCoordinator } from "./recycleCoordinator.js";
import { getForkRecycleConfig, shouldRequestRecycle } from "./recyclePolicy.js";
import { createWorkerDrainer } from "./workerDrainer.js";

const RECYCLE_REQUEST = "fork-recycle:request";
const RECYCLE_DRAIN = "fork-recycle:drain";
const RECYCLE_ABORT = "fork-recycle:abort";

type RecycleMessage = { type?: string };

export type PrimaryForkRecycling = {
	/** True when this exit completed a recycle — caller must not respawn. */
	handleExit: (worker: Worker) => boolean;
};

export const attachPrimaryForkRecycling = ({
	clusterModule,
	shouldRespawn,
	logger,
}: {
	clusterModule: typeof cluster;
	shouldRespawn: () => boolean;
	logger: Logger;
}): PrimaryForkRecycling => {
	const workerIds = new Map<string, Worker>();

	// A worker whose IPC channel just closed makes `send` raise; the exit
	// handler reconciles that case, so the failed write must not crash us.
	const sendSafely = (workerId: string, type: string) => {
		try {
			workerIds.get(workerId)?.send({ type }, (error) => {
				if (error) console.warn(`[ForkRecycle] ${type} -> ${workerId} failed`);
			});
		} catch {
			console.warn(`[ForkRecycle] ${type} -> ${workerId} failed`);
		}
	};

	const coordinator = createRecycleCoordinator({
		forkReplacement: () => {
			const worker = clusterModule.fork();
			workerIds.set(String(worker.id), worker);
			return String(worker.id);
		},
		sendDrain: (workerId) => sendSafely(workerId, RECYCLE_DRAIN),
		sendAbort: (workerId) => sendSafely(workerId, RECYCLE_ABORT),
		killWorker: (workerId) => {
			try {
				workerIds.get(workerId)?.kill();
			} catch {
				console.warn(`[ForkRecycle] kill -> ${workerId} failed`);
			}
		},
		respawn: () => {
			if (!shouldRespawn()) return undefined;
			const worker = clusterModule.fork();
			workerIds.set(String(worker.id), worker);
			return String(worker.id);
		},
		// FireLens delivers console output reliably; the logger transport
		// drops most lines, which hid the first prod recycle wave entirely.
		log: (message) => console.log(message),
	});

	clusterModule.on("listening", (worker) => {
		workerIds.set(String(worker.id), worker);
		coordinator.handleWorkerListening({ workerId: String(worker.id) });
	});

	clusterModule.on("message", (worker, message: RecycleMessage) => {
		if (message?.type !== RECYCLE_REQUEST) return;
		// Load-bearing: the coordinator clears a worker's latch on exit and has no
		// other guard, so a post-exit request would start a cycle for a corpse.
		if (worker.isDead?.()) return;
		coordinator.handleRecycleRequest({ workerId: String(worker.id) });
	});

	return {
		handleExit: (worker) => {
			const workerId = String(worker.id);
			workerIds.delete(workerId);
			return coordinator.handleWorkerExit({ workerId });
		},
	};
};

/** Coordinator owns respawns for every exit it sees, so the caller's exit
 *  handler must fork only when this returns false AND it wants crash respawn —
 *  see handleExit. Worker side below. */
export const startWorkerForkRecycling = ({
	server,
	exitGracefully,
	getActiveRequestCount,
	onDrainStart,
	logger,
}: {
	server: Parameters<typeof createWorkerDrainer>[0]["server"];
	/** Runs the worker's normal shutdown (flushes, pool close, process.exit). */
	exitGracefully: () => void;
	/** Long-running requests (streams) extend the drain instead of being cut. */
	getActiveRequestCount?: () => number;
	onDrainStart?: () => void;
	logger: Logger;
}) => {
	const config = getForkRecycleConfig();
	if (!config.enabled) return;

	const startedAt = Date.now();
	let requested = false;

	const drainer = createWorkerDrainer({
		server,
		exit: () => exitGracefully(),
		drainTimeoutMs: config.drainTimeoutMs,
		getActiveRequestCount,
		onDrainStart,
		log: (message) => console.log(message),
	});

	process.on("message", (message: RecycleMessage) => {
		if (message?.type === RECYCLE_DRAIN) {
			drainer.drain();
			return;
		}
		if (message?.type === RECYCLE_ABORT) {
			// Replacement failed to boot; re-arm so a later check can ask again.
			requested = false;
			console.log(
				`[ForkRecycle] Worker ${process.pid} recycle aborted; will re-request if still over threshold`,
			);
		}
	});

	const check = () => {
		if (requested) return;
		const rssBytes = process.memoryUsage.rss();
		if (
			!shouldRequestRecycle({
				rssBytes,
				thresholdBytes: config.rssThresholdBytes,
				ageMs: Date.now() - startedAt,
				minAgeMs: config.minAgeMs,
			})
		) {
			return;
		}

		requested = true;
		console.log(
			`[ForkRecycle] Worker ${process.pid} requesting recycle at rss=${Math.round(rssBytes / 1024 / 1024)}MB after ${Math.round((Date.now() - startedAt) / 60_000)}min`,
		);
		// Keep the structured event for the fraction the logger pipeline delivers.
		logger.info(
			`[ForkRecycle] Worker ${process.pid} requesting recycle at rss=${Math.round(rssBytes / 1024 / 1024)}MB after ${Math.round((Date.now() - startedAt) / 60_000)}min`,
			{
				type: "fork_recycle_request",
				data: {
					pid: process.pid,
					rssMB: Math.round(rssBytes / 1024 / 1024),
					ageMinutes: Math.round((Date.now() - startedAt) / 60_000),
				},
			},
		);
		try {
			process.send?.({ type: RECYCLE_REQUEST }, undefined, undefined, () => {});
		} catch {
			// Channel already closed (primary going away); the process is exiting.
		}
	};

	// Jitter so same-boot forks never check in sync.
	const interval = config.checkIntervalMs * (0.9 + Math.random() * 0.2);
	const timer = setInterval(check, interval);
	timer.unref?.();
};
