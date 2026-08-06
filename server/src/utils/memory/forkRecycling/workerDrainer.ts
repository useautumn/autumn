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
	log,
}: {
	server: DrainableServer;
	exit: (code: number) => void;
	drainTimeoutMs: number;
	idleSweepIntervalMs?: number;
	log: (message: string) => void;
}): WorkerDrainer => {
	let draining = false;

	return {
		drain: () => {
			if (draining) return;
			draining = true;

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
			server.closeIdleConnections?.();
			server.close(() => exitOnce("drained"));

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
