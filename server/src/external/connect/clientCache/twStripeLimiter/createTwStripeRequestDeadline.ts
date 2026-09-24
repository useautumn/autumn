import { setTimeout as delay } from "node:timers/promises";

export const createTwStripeRequestDeadline = ({
	timeoutMs,
	signal,
}: {
	timeoutMs: number;
	signal?: AbortSignal;
}) => {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
		throw new Error("TW Stripe request timeout must be finite and positive");
	const expiresAt = performance.now() + timeoutMs;
	const remainingMs = () => {
		signal?.throwIfAborted();
		const remaining = expiresAt - performance.now();
		if (remaining <= 0)
			throw new Error(`TW Stripe request exceeded ${timeoutMs}ms`);
		return Math.ceil(remaining);
	};
	const sleep = async (ms: number) => {
		await delay(Math.min(ms, remainingMs()), undefined, { signal });
		remainingMs();
	};
	return { signal, remainingMs, sleep };
};
