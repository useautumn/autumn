/** How often the thread notes that its event loop came round. */
const TICK_EVERY_MS = 10;

/** How far behind this thread's event loop is right now: any work queued behind it has waited at least as long. */
export type LoopWatch = {
	lagMs(): number;
	stop(): void;
};

export const startLoopWatch = ({
	now = () => performance.now(),
}: {
	now?: () => number;
} = {}): LoopWatch => {
	let dueAt = now() + TICK_EVERY_MS;
	const timer = setInterval(() => {
		dueAt = now() + TICK_EVERY_MS;
	}, TICK_EVERY_MS);
	timer.unref();
	return {
		lagMs: () => Math.max(0, now() - dueAt),
		stop: () => clearInterval(timer),
	};
};
