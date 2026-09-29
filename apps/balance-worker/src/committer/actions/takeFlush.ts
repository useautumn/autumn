import type { CommitterState, Flush } from "../types/committer.js";

/** Drains queued calls, oldest first, until the row cap; a single oversized call still goes alone. */
export const takeFlush = ({
	state,
	maxRows,
}: {
	state: CommitterState;
	maxRows: number;
}): Flush | null => {
	const calls = [];
	let rows = 0;
	while (state.queue.length > 0) {
		const next = state.queue[0];
		if (!next) break;
		if (calls.length > 0 && rows + next.rows > maxRows) break;
		state.queue.shift();
		calls.push(next);
		rows += next.rows;
	}
	return calls.length > 0 ? { calls } : null;
};
