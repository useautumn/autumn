type DrainableServer = {
	close: (callback: () => void) => void;
	/** Keep-alive sockets with no active request block `close` forever; the
	 *  periodic sweep evicts them so drain completes between requests. */
	closeIdleConnections?: () => void;
};

export type WorkerDrainer = {
	drain: () => void;
};

export const createWorkerDrainer = ({
	server,
	exit,
	drainTimeoutMs,
	idleSweepIntervalMs = 1_000,
	onDrainStart,
	log,
}: {
	server: DrainableServer;
	exit: (code: number) => void;
	drainTimeoutMs: number;
	idleSweepIntervalMs?: number;
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

			let exited = false;
			const exitOnce = (reason: string) => {
				if (exited) return;
				exited = true;
				clearInterval(idleSweep);
				clearTimeout(deadline);
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

			const deadline = setTimeout(
				() => exitOnce("drain timeout"),
				drainTimeoutMs,
			);
			deadline.unref?.();
		},
	};
};
