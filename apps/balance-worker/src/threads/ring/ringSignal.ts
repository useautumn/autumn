import type { RingSignal } from "./types/ringSignal.js";

const BELL = 0;
const SLEEPING = 1;

type WaitAsync = (
	cells: Int32Array,
	index: number,
	value: number,
	timeout: number,
) => { async: boolean; value: Promise<string> | string };

// Bun implements Atomics.waitAsync; the repo's TS lib predates it.
const waitAsync = (Atomics as unknown as { waitAsync: WaitAsync }).waitAsync;

/** A new signal, or the reader's view of one another thread created (`sab`). */
export const createRingSignal = ({
	sab = new SharedArrayBuffer(16),
}: {
	sab?: SharedArrayBuffer;
} = {}): RingSignal => {
	const cells = new Int32Array(sab);

	function wake(): boolean {
		if (Atomics.load(cells, SLEEPING) !== 1) return false;
		Atomics.add(cells, BELL, 1);
		Atomics.notify(cells, BELL);
		return true;
	}

	async function sleep({
		hasWork,
		timeoutMs,
	}: {
		hasWork: () => boolean;
		timeoutMs: number;
	}): Promise<boolean> {
		const bell = Atomics.load(cells, BELL);
		Atomics.store(cells, SLEEPING, 1);
		if (hasWork()) {
			Atomics.store(cells, SLEEPING, 0);
			return true;
		}
		const waited = waitAsync(cells, BELL, bell, timeoutMs);
		const outcome = waited.async ? await waited.value : waited.value;
		Atomics.store(cells, SLEEPING, 0);
		return outcome !== "timed-out";
	}

	return { sab, wake, sleep };
};
