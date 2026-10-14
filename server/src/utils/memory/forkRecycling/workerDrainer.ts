type DrainableServer = {
	close: (callback: () => void) => void;
	closeIdleConnections?: () => void;
};

export type WorkerDrainer = {
	drain: () => void;
};

export const DEFAULT_MAX_DRAIN_MS = 10 * 60_000;

export const createWorkerDrainer = ({
	server,
	exit,
	drainTimeoutMs,
	graceMs,
	maxDrainMs = DEFAULT_MAX_DRAIN_MS,
	idleSweepIntervalMs = 1_000,
	getActiveRequestCount,
	onDrainStart,
	log,
}: {
	server: DrainableServer;
	exit: (code: number) => void;
	drainTimeoutMs: number;
	graceMs: number;
	maxDrainMs?: number;
	idleSweepIntervalMs?: number;
	getActiveRequestCount?: () => number;
	onDrainStart?: () => void;
	log: (message: string) => void;
}): WorkerDrainer => {
	let draining = false;

	return {
		drain: () => {
			if (draining) return;
			draining = true;
			onDrainStart?.();

			const drainStartedAt = Date.now();
			let exited = false;
			let idleSweep: ReturnType<typeof setInterval> | null = null;
			let deadline: ReturnType<typeof setTimeout> | null = null;
			const exitOnce = (reason: string) => {
				if (exited) return;
				exited = true;
				if (idleSweep) clearInterval(idleSweep);
				if (deadline) clearTimeout(deadline);
				log(`[ForkRecycle] Worker ${process.pid} exiting (${reason})`);
				exit(0);
			};

			const onDeadline = () => {
				const activeRequests = getActiveRequestCount?.() ?? 0;
				const elapsedMs = Date.now() - drainStartedAt;
				if (activeRequests > 0 && elapsedMs < maxDrainMs) {
					log(
						`[ForkRecycle] Worker ${process.pid} still serving ${activeRequests} request(s) after ${Math.round(elapsedMs / 1000)}s; extending drain`,
					);
					armDeadline();
					return;
				}
				exitOnce(activeRequests > 0 ? "max drain exceeded" : "drain timeout");
			};

			const armDeadline = () => {
				const remainingMs = maxDrainMs - (Date.now() - drainStartedAt);
				const intervalMs = Math.max(
					1,
					Math.min(drainTimeoutMs, Math.max(remainingMs, 1)),
				);
				deadline = setTimeout(onDeadline, intervalMs);
				deadline.unref?.();
			};

			const closeServer = () => {
				log(
					`[ForkRecycle] Worker ${process.pid} closing server after ${graceMs}ms grace`,
				);
				server.close(() => exitOnce("drained"));
				idleSweep = setInterval(
					() => server.closeIdleConnections?.(),
					idleSweepIntervalMs,
				);
				idleSweep.unref?.();
				armDeadline();
			};

			log(`[ForkRecycle] Worker ${process.pid} draining`);
			const grace = setTimeout(closeServer, graceMs);
			grace.unref?.();
		},
	};
};
