type DrainableServer = {
	close: (callback: () => void) => void;
	/** Keep-alive sockets with no active request block `close` forever; the
	 *  periodic sweep evicts them so drain completes between requests. */
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
	maxDrainMs = DEFAULT_MAX_DRAIN_MS,
	idleSweepIntervalMs = 1_000,
	getActiveRequestCount,
	onDrainStart,
	log,
}: {
	server: DrainableServer;
	exit: (code: number) => void;
	drainTimeoutMs: number;
	/** Hard bound for a fork that never goes idle (a truly hung request). */
	maxDrainMs?: number;
	idleSweepIntervalMs?: number;
	/** While this reports active requests (long streams, big imports), the
	 *  drain deadline extends instead of cutting them mid-response. */
	getActiveRequestCount?: () => number;
	/** Runs before the server closes — lets the request path start sending
	 *  `Connection: close` so pooled clients retire sockets instead of racing
	 *  the idle-connection eviction. */
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
			let deadline: ReturnType<typeof setTimeout> | null = null;
			const exitOnce = (reason: string) => {
				if (exited) return;
				exited = true;
				clearInterval(idleSweep);
				if (deadline) clearTimeout(deadline);
				log(`[ForkRecycle] Worker ${process.pid} exiting (${reason})`);
				exit(0);
			};

			log(`[ForkRecycle] Worker ${process.pid} draining`);
			server.close(() => exitOnce("drained"));

			// First sweep only after a full interval: gives in-flight responses a
			// beat to carry `Connection: close` so pooled sockets retire themselves
			// instead of being evicted out from under the client.
			const idleSweep = setInterval(
				() => server.closeIdleConnections?.(),
				idleSweepIntervalMs,
			);
			idleSweep.unref?.();

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
				deadline = setTimeout(onDeadline, drainTimeoutMs);
				deadline.unref?.();
			};
			armDeadline();
		},
	};
};
