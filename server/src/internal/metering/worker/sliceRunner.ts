// Bounds how long a synchronous fold loop can run before giving the event
// loop a turn. Without this, folding a full Kafka batch (or a long
// crash-restore replay) blocks the process for the whole batch, so
// concurrent HTTP handlers (and kafkajs's own background heartbeat) queue
// behind it. `tick()` is called once per processed item; it counts events
// and wall time since the current turn started and awaits `yieldFn()` once
// either budget is exhausted, then starts a fresh turn.
export type SliceRunner = {
	tick: () => Promise<void>;
};

export const createSliceRunner = ({
	budgetMs,
	budgetEvents,
	yieldFn,
	now = () => performance.now(),
}: {
	budgetMs: number;
	budgetEvents: number;
	yieldFn: () => Promise<void>;
	now?: () => number;
}): SliceRunner => {
	let turnStartedAt = now();
	let eventsInTurn = 0;

	const tick = async (): Promise<void> => {
		eventsInTurn++;
		const elapsedMs = now() - turnStartedAt;

		if (eventsInTurn < budgetEvents && elapsedMs < budgetMs) return;

		await yieldFn();
		eventsInTurn = 0;
		turnStartedAt = now();
	};

	return { tick };
};

export const yieldToEventLoop = (): Promise<void> =>
	new Promise((resolve) => setImmediate(resolve));
