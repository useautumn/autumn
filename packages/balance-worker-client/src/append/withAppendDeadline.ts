import type { RequestDeadline } from "../routing/types/routing.js";
import { assertRequestDeadline } from "../routing/workerRequestPolicy.js";

/**
 * The client's budget over a Kafka append, the same deadline `sendToOwner` puts on an HTTP command.
 * A send cannot be cancelled, so a late append may still land: the outcome is "unknown".
 */
export async function withAppendDeadline<T>({
	timeoutMs,
	signal,
	run,
}: {
	timeoutMs: number;
	signal?: AbortSignal;
	run: () => Promise<T>;
}): Promise<T> {
	const timeout = AbortSignal.timeout(timeoutMs);
	const deadline: RequestDeadline = {
		expiresAt: performance.now() + timeoutMs,
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
	};
	assertRequestDeadline({ deadline, outcome: "not_submitted" });

	const attempt = run();
	// Once the deadline wins, nobody is left to hear a late failure; settling it here keeps it from surfacing as an unhandled rejection.
	void Promise.allSettled([attempt]);

	const interrupted = Promise.withResolvers<never>();
	function abort(): void {
		try {
			assertRequestDeadline({ deadline, outcome: "unknown" });
		} catch (cause) {
			interrupted.reject(cause);
		}
	}
	deadline.signal.addEventListener("abort", abort, { once: true });
	try {
		return await Promise.race([attempt, interrupted.promise]);
	} finally {
		deadline.signal.removeEventListener("abort", abort);
	}
}
