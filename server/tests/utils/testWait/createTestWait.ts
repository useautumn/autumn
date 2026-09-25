import { setTimeout as delay } from "node:timers/promises";

export const createTestWait = ({
	timeoutMs,
	description,
	signal: parentSignal,
}: {
	timeoutMs: number;
	description: string;
	signal?: AbortSignal;
}) => {
	if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
		throw new Error("Test wait timeout must be a finite, non-negative number");
	const controller = new AbortController();
	const { signal } = controller;
	const deadline = performance.now() + timeoutMs;
	const expired = () =>
		controller.abort(new Error(`${description} exceeded ${timeoutMs}ms`));
	const timer = setTimeout(expired, timeoutMs);
	const onParentAbort = () => controller.abort(parentSignal?.reason);
	parentSignal?.addEventListener("abort", onParentAbort, { once: true });
	if (parentSignal?.aborted) onParentAbort();

	const remainingMs = () => {
		if (performance.now() >= deadline) expired();
		signal.throwIfAborted();
		return Math.max(1, Math.ceil(deadline - performance.now()));
	};

	// Ending a wait doesn't undo an accepted remote write; callers must quarantine uncertain outcomes.
	const run = async <T>(operation: () => Promise<T>): Promise<T> => {
		remainingMs();
		let onAbort: () => void = () => {};
		const aborted = new Promise<never>((_, reject) => {
			onAbort = () => reject(signal.reason);
			signal.addEventListener("abort", onAbort, { once: true });
		});
		try {
			const result = await Promise.race([operation(), aborted]);
			remainingMs();
			return result;
		} finally {
			signal.removeEventListener("abort", onAbort);
		}
	};

	const sleep = async (ms: number) => {
		remainingMs();
		try {
			await delay(Math.min(ms, remainingMs()), undefined, { signal });
		} catch (error) {
			signal.throwIfAborted();
			throw error;
		}
		remainingMs();
	};

	const close = () => {
		clearTimeout(timer);
		parentSignal?.removeEventListener("abort", onParentAbort);
		controller.abort(new Error(`${description} finished`));
	};

	return { signal, remainingMs, run, sleep, close };
};
