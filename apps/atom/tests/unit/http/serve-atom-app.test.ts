import { expect, test } from "bun:test";
import { ESCAPING_SERVER } from "./utils/escapingServer.js";

const nextMessage = (worker: Worker) =>
	new Promise<unknown>((resolve) =>
		worker.addEventListener("message", (event) => resolve(event.data), {
			once: true,
		}),
	);

test("an error escaping the app, even with a failing logger, is a 500 and the worker thread keeps serving", async () => {
	const worker = new Worker(ESCAPING_SERVER);
	try {
		const port = await nextMessage(worker);
		const send = (path: string) =>
			fetch(`http://127.0.0.1:${port}${path}`, {
				headers: { connection: "close" },
			});
		const statuses: number[] = [];
		for (const path of ["/sync", "/async", "/sync", "/async"])
			statuses.push(
				await send(path).then(
					(response) => response.status,
					() => 0,
				),
			);
		expect(statuses).toEqual([500, 500, 500, 500]);
		expect(await (await send("/sync")).json()).toEqual({
			message: "Atom could not answer",
			code: "internal_error",
		});
		const alive = nextMessage(worker);
		worker.postMessage("ping");
		expect(await alive).toBe("alive");
	} finally {
		worker.terminate();
	}
});
