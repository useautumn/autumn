import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";

/** Nothing in flight will be answered, so it fails as an unknown outcome, which is what it is. */
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
	const message = `Producer thread failed: ${String((cause as Error)?.message ?? cause)}`;
	for (const [reqId, resolve] of scope.pending) {
		scope.pending.delete(reqId);
		resolve({
			ok: false,
			error: { kind: "other", name: "KafkaJSError", message, retriable: false },
		});
	}
	scope.ctx.onFatal({ cause });
}
