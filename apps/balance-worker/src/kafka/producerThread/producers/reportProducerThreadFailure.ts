import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";

/** Requests the thread will never answer fail as an unknown outcome, which is what they are. */
export function failPendingAsUnknown({
	scope,
	message,
}: {
	scope: ThreadedProducersScope;
	message: string;
}): void {
	for (const [reqId, resolve] of scope.pending) {
		scope.pending.delete(reqId);
		resolve({
			ok: false,
			error: { kind: "other", name: "KafkaJSError", message, retriable: false },
		});
	}
}

export function reportProducerThreadFailure({
	scope,
	cause,
}: {
	scope: ThreadedProducersScope;
	cause: unknown;
}): void {
	const { state } = scope;
	if (state.failed || state.stopping) return;
	state.failed = true;
	scope.ctx.logger.error(
		{ error: cause },
		"Producer thread failed; the task must be replaced",
	);
	failPendingAsUnknown({
		scope,
		message: `Producer thread failed: ${String((cause as Error)?.message ?? cause)}`,
	});
	scope.ctx.onFatal({ cause });
}
