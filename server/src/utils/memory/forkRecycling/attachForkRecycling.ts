import type cluster from "node:cluster";
import type { Worker } from "node:cluster";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createRecycleCoordinator } from "./recycleCoordinator.js";
import { getForkRecycleConfig, shouldRequestRecycle } from "./recyclePolicy.js";
import { createWorkerDrainer } from "./workerDrainer.js";

const RECYCLE_REQUEST = "fork-recycle:request";
const RECYCLE_DRAIN = "fork-recycle:drain";

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

	const coordinator = createRecycleCoordinator({
		forkReplacement: () => {
			const worker = clusterModule.fork();
			workerIds.set(String(worker.id), worker);
			return String(worker.id);
		},
		sendDrain: (workerId) => {
			workerIds.get(workerId)?.send({ type: RECYCLE_DRAIN });
		},
		respawn: () => {
			if (!shouldRespawn()) return;
			const worker = clusterModule.fork();
			workerIds.set(String(worker.id), worker);
		},
		log: (message) => logger.info(message),
	});

	clusterModule.on("listening", (worker) => {
		workerIds.set(String(worker.id), worker);
		coordinator.handleWorkerListening({ workerId: String(worker.id) });
	});

	clusterModule.on("message", (worker, message: RecycleMessage) => {
		if (message?.type !== RECYCLE_REQUEST) return;
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
	logger,
}: {
	server: Parameters<typeof createWorkerDrainer>[0]["server"];
	/** Runs the worker's normal shutdown (flushes, pool close, process.exit). */
	exitGracefully: () => void;
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
		log: (message) => logger.info(message),
	});

	process.on("message", (message: RecycleMessage) => {
		if (message?.type !== RECYCLE_DRAIN) return;
		drainer.drain();
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
		process.send?.({ type: RECYCLE_REQUEST });
	};

	// Jitter so same-boot forks never check in sync.
	const interval = config.checkIntervalMs * (0.9 + Math.random() * 0.2);
	const timer = setInterval(check, interval);
	timer.unref?.();
};
