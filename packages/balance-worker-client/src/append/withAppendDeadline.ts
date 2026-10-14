import type { RequestDeadline } from "../routing/types/routing.js";
import { assertRequestDeadline } from "../routing/workerRequestPolicy.js";

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
