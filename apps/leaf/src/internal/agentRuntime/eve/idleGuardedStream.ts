export async function* idleGuardedStream<Item>({
	idleTimeoutMs,
	onIdleTimeout,
	open,
	signal,
}: {
	idleTimeoutMs: number | (() => number);
	onIdleTimeout: () => Error;
	open: (
		signal: AbortSignal,
	) => AsyncIterable<Item> | Promise<AsyncIterable<Item>>;
	signal?: AbortSignal;
}): AsyncGenerator<Item> {
	const controller = new AbortController();
	const abortUpstream = () => controller.abort();
	signal?.addEventListener("abort", abortUpstream, { once: true });
	let timedOut = false;
	const armIdleTimer = () =>
		setTimeout(
			() => {
				timedOut = true;
				controller.abort();
			},
			typeof idleTimeoutMs === "function" ? idleTimeoutMs() : idleTimeoutMs,
		);
	let idleTimer = armIdleTimer();
	try {
		for await (const item of await open(controller.signal)) {
			clearTimeout(idleTimer);
			idleTimer = armIdleTimer();
			yield item;
		}
		if (timedOut) throw onIdleTimeout();
	} catch (error) {
		if (timedOut) throw onIdleTimeout();
		throw error;
	} finally {
		clearTimeout(idleTimer);
		signal?.removeEventListener("abort", abortUpstream);
	}
}
