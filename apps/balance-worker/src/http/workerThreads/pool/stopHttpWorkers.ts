import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";
import type { DecideThreadMessage } from "../types/httpWorkerThread.js";

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
		}
	}
	await Promise.all(lanes.map((lane) => lane.stopped));
	scope.state.stopping = true;
	for (const lane of lanes) lane.thread.terminate();
}
