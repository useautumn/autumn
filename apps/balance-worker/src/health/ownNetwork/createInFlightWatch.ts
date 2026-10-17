import type { InFlightWatch } from "./types/inFlightWatch.js";

export function createInFlightWatch({
	now = () => performance.now(),
}: {
	now?: () => number;
} = {}): InFlightWatch {
	const startedAtById = new Map<number, number>();
	const state: { nextId: number; settledLongestMs: number | null } = {
		nextId: 0,
		settledLongestMs: null,
	};

	function settle({ id }: { id: number }): void {
		const startedAt = startedAtById.get(id);
		startedAtById.delete(id);
		if (startedAt !== undefined)
			state.settledLongestMs = Math.max(
				state.settledLongestMs ?? 0,
				now() - startedAt,
			);
	}

	async function track<Value>(work: () => Promise<Value>): Promise<Value> {
		const id = state.nextId++;
		startedAtById.set(id, now());
		try {
			const value = await work();
			settle({ id });
			return value;
		} catch (cause) {
			settle({ id });
			throw cause;
		}
	}

	function takeLongestMs({ now: at }: { now: number }): number | null {
		let longest = state.settledLongestMs;
		state.settledLongestMs = null;
		for (const startedAt of startedAtById.values())
			longest = Math.max(longest ?? 0, at - startedAt);
		return longest;
	}

	return { track, takeLongestMs };
}
