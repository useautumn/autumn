import type { ConsumerRunnerScope } from "./types/runnerState.js";

/** Ends every batch in flight and has the loop rewind to the last commit once they return, as kafkajs rejoined. */
export function requestRestart({
	scope,
	cause,
	pollFirst = false,
}: {
	scope: ConsumerRunnerScope;
	cause: unknown;
	pollFirst?: boolean;
}): void {
	const { state } = scope;
	if (state.restartPending) return;
	state.restartPending = {
		cause: cause instanceof Error ? cause : new Error(String(cause)),
		terminal: false,
		pollFirst,
	};
	for (const key of state.assigned.keys())
		state.generation.set(key, (state.generation.get(key) ?? 0) + 1);
}
