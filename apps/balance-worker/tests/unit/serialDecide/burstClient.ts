/** Fires `count` POSTs at once and reports their statuses; a 429 comes straight from the I/O worker. */
// biome-ignore lint/suspicious/noExplicitAny: the Worker global in a worker script
(globalThis as any).onmessage = async (
	event: MessageEvent<{ port: number; count: number; body: string }>,
) => {
	const { port, count, body } = event.data;
	const statuses = await Promise.all(
		Array.from({ length: count }, () =>
			fetch(`http://127.0.0.1:${port}/v1/track`, { method: "POST", body }).then(
				(response) => response.status,
				() => -1,
			),
		),
	);
	postMessage(statuses);
};
