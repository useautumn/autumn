import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";
import type { DecideThreadMessage } from "../types/httpWorkerThread.js";

/**
 * Each thread stops taking connections and finishes the requests it has, which this thread keeps answering
 * until every thread says it is done; a thread that already exited is not waited for.
 */
export async function stopHttpWorkers({
	scope,
}: {
	scope: HttpWorkerPoolScope;
}): Promise<void> {
	const { lanes } = scope.state;
	for (const lane of lanes) {
		try {
			lane.thread.postMessage({ kind: "stop" } satisfies DecideThreadMessage);
		} catch {
			// Already gone: its `close` has settled `stopped`.
		}
	}
	await Promise.all(lanes.map((lane) => lane.stopped));
	scope.state.stopping = true;
	for (const lane of lanes) lane.thread.terminate();
}
