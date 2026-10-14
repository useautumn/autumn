const TICK_EVERY_MS = 10;

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
