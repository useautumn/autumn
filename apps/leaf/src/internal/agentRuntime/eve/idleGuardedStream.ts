/** Aborts the upstream when no item arrives within the idle window; the
 * caller distinguishes the timeout from a real abort via `timedOut`. */
export async function* idleGuardedStream<Item>({
	idleTimeoutMs,
	onIdleTimeout,
	open,
	signal,
}: {
	idleTimeoutMs: number;
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
		setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, idleTimeoutMs);
	let idleTimer = armIdleTimer();
	try {
		for await (const item of await open(controller.signal)) {
			clearTimeout(idleTimer);
			idleTimer = armIdleTimer();
			yield item;
		}
	} catch (error) {
		if (timedOut) throw onIdleTimeout();
		throw error;
	} finally {
		clearTimeout(idleTimer);
		signal?.removeEventListener("abort", abortUpstream);
	}
}
