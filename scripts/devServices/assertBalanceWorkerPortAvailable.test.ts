import { expect, test } from "bun:test";
import { assertBalanceWorkerPortAvailable } from "./assertBalanceWorkerPortAvailable.ts";

test("refuses an occupied worker port without stopping the listener", async () => {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response("still alive"),
	});
	const port = server.port;
	if (!port) throw new Error("No listener port");
	try {
		await expect(assertBalanceWorkerPortAvailable({ port })).rejects.toThrow(
			"occupied",
		);
		expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe(
			"still alive",
		);
	} finally {
		await server.stop();
	}
	await expect(
		assertBalanceWorkerPortAvailable({ port }),
	).resolves.toBeUndefined();
});
