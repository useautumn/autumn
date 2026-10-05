import type { HttpWorkerListener } from "../../http/workerThreads/types/httpWorkerPool.js";
import type { CommitPositions } from "../../runtime/commitPositions/types/commitPositions.js";

/** Every commit wakes the threads holding replies, and every published failure reaches them, rendered; the result stops both. */
export function connectHeldReplies({
	positions,
	http,
	renderFailure,
}: {
	positions: Pick<CommitPositions, "onCommitted" | "onFailedAbove">;
	http: Pick<HttpWorkerListener, "commitPositionMoved" | "failHeld">;
	renderFailure(params: { cause: unknown }): { status: number; body: string };
}): () => void {
	function moved({ partition, seq }: { partition: number; seq: number }) {
		http.commitPositionMoved({ partition, seq });
	}
	function failed({
		partition,
		seq,
		lastSeq,
		cause,
	}: {
		partition: number;
		seq: number;
		lastSeq: number;
		cause: unknown;
	}) {
		http.failHeld({
			partition,
			aboveSeq: seq,
			lastSeq,
			...renderFailure({ cause }),
		});
	}
	const stopCommitted = positions.onCommitted(moved);
	const stopFailed = positions.onFailedAbove(failed);
	function disconnect(): void {
		stopCommitted();
		stopFailed();
	}
	return disconnect;
}
