import type cluster from "node:cluster";
import type { Worker } from "node:cluster";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createRecycleCoordinator } from "./recycleCoordinator.js";
import {
	getForkRecycleConfig,
	msUntilHourlyBlackoutEnd,
	rollEligibilityDelayMs,
	shouldRequestRecycle,
} from "./recyclePolicy.js";
import { createWorkerDrainer } from "./workerDrainer.js";

const RECYCLE_REQUEST = "fork-recycle:request";
const RECYCLE_DRAIN = "fork-recycle:drain";
const RECYCLE_ABORT = "fork-recycle:abort";

type RecycleMessage = { type?: string };

export type PrimaryForkRecycling = {
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
		log: (message) => console.log(message),
	});

	clusterModule.on("listening", (worker) => {
		workerIds.set(String(worker.id), worker);
		coordinator.handleWorkerListening({ workerId: String(worker.id) });
	});

	clusterModule.on("message", (worker, message: RecycleMessage) => {
		if (message?.type !== RECYCLE_REQUEST) return;
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

export const startWorkerForkRecycling = ({
	server,
	exitGracefully,
	getActiveRequestCount,
	onDrainStart,
	logger,
}: {
	server: Parameters<typeof createWorkerDrainer>[0]["server"];
	exitGracefully: () => void;
	getActiveRequestCount?: () => number;
	onDrainStart?: () => void;
	logger: Logger;
}) => {
	const config = getForkRecycleConfig();
	if (!config.enabled) return;

	const delayMs = rollEligibilityDelayMs(config);
	console.log(
		`[ForkRecycle] Worker ${process.pid} ready in ${Math.round(process.uptime() * 1000)}ms; eligibility delay: ${Math.round(delayMs / 1000)}s`,
	);

	const startedAt = Date.now();
	let requested = false;
	let requestAtMs: number | null = null;

	const drainer = createWorkerDrainer({
		server,
		exit: () => exitGracefully(),
		drainTimeoutMs: config.drainTimeoutMs,
		graceMs: config.drainGraceMs,
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
			requestAtMs = null;
			return;
		}
		const now = Date.now();
		if (requestAtMs === null) requestAtMs = now + delayMs;
		if (now < requestAtMs) return;
		const blackoutRemainingMs = msUntilHourlyBlackoutEnd({
			now,
			beforeMs: config.blackoutBeforeMs,
			afterMs: config.blackoutAfterMs,
		});
		if (blackoutRemainingMs > 0) {
			requestAtMs = now + blackoutRemainingMs + rollEligibilityDelayMs(config);
			console.log(
				`[ForkRecycle] Worker ${process.pid} deferring recycle past hourly blackout (${Math.round((requestAtMs - now) / 1000)}s)`,
			);
			return;
		}

		requested = true;
		console.log(
			`[ForkRecycle] Worker ${process.pid} requesting recycle at rss=${Math.round(rssBytes / 1024 / 1024)}MB after ${Math.round((Date.now() - startedAt) / 60_000)}min`,
		);
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
		} catch {}
	};

	const interval = config.checkIntervalMs * (0.9 + Math.random() * 0.2);
	const timer = setInterval(check, interval);
	timer.unref?.();

	let lastBeatMs = Date.now();
	let lastCpu = process.cpuUsage();
	const stallTimer = setInterval(() => {
		const now = Date.now();
		const cpu = process.cpuUsage();
		const elapsedMs = now - lastBeatMs;
		const stallMs = elapsedMs - 1_000;
		const cpuMs =
			(cpu.user + cpu.system - lastCpu.user - lastCpu.system) / 1_000;
		lastBeatMs = now;
		lastCpu = cpu;
		if (stallMs > 100 && elapsedMs > 0) {
			console.log(
				`[ForkRecycle] Worker ${process.pid} event-loop stall: ${stallMs}ms (own cpu ${Math.round((cpuMs / elapsedMs) * 100)}%)`,
			);
		}
	}, 1_000);
	stallTimer.unref?.();
};
