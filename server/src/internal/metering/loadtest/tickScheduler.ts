import { createTickAccumulator } from "./tickAccumulator.js";

export type TickLoopController = {
	// Stops scheduling new ticks and resolves `done` once in-flight work
	// finishes — call this from a SIGTERM handler to flush before exit.
	stop: () => void;
	done: Promise<void>;
};

// Drives `onTick` at a fixed cadence (self-correcting setTimeout, not a
// busy loop) for `durationS` seconds, handing each tick the batch size the
// accumulator says is due. `onTick` is fired-and-forgotten per tick so a
// slow batch never delays the schedule, but its promise is tracked so
// `stop()`/natural completion can wait for outstanding work before `done`
// resolves.
export const startFixedTickLoop = ({
	ratePerSec,
	tickIntervalMs,
	durationS,
	onTick,
}: {
	ratePerSec: number;
	tickIntervalMs: number;
	durationS: number;
	onTick: (params: { batchSize: number }) => void | Promise<void>;
}): TickLoopController => {
	const accumulator = createTickAccumulator({ ratePerSec, tickIntervalMs });
	const totalTicks = Math.max(
		1,
		Math.ceil((durationS * 1000) / tickIntervalMs),
	);
	const pending = new Set<Promise<unknown>>();

	let ticksDone = 0;
	let stopped = false;
	let finished = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let resolveDone: () => void = () => {};
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});

	const finish = async (): Promise<void> => {
		if (finished) return;
		finished = true;
		await Promise.allSettled([...pending]);
		resolveDone();
	};

	const tick = (): void => {
		if (stopped || ticksDone >= totalTicks) {
			void finish();
			return;
		}

		const tickStartedAt = Date.now();
		ticksDone++;
		const batchSize = accumulator.next();

		if (batchSize > 0) {
			const work = Promise.resolve(onTick({ batchSize }));
			pending.add(work);
			work.finally(() => pending.delete(work));
		}

		const elapsed = Date.now() - tickStartedAt;
		timer = setTimeout(tick, Math.max(0, tickIntervalMs - elapsed));
	};

	timer = setTimeout(tick, 0);

	const stop = (): void => {
		if (stopped) return;
		stopped = true;
		if (timer) clearTimeout(timer);
		void finish();
	};

	return { stop, done };
};
