import { expect, test } from "bun:test";
import { Autumn } from "../src/sdk/sdk.js";

const noopLogger = { group: () => {}, groupEnd: () => {}, log: () => {} };

const startStalledBodyServer = () =>
	Bun.serve({
		port: 0,
		fetch: () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('{"list":'));
					},
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			),
	});

test("a timeout during a logged 2xx body read rejects as RequestTimeoutError", async () => {
	const server = startStalledBodyServer();

	try {
		const autumn = new Autumn({
			failOpen: false,
			secretKey: "test",
			serverURL: `http://127.0.0.1:${server.port}`,
			timeoutMs: 200,
			retryConfig: { strategy: "none" },
			debugLogger: noopLogger,
		});

		await expect(
			autumn.events.aggregate({ featureId: "credits", range: "90d" }),
		).rejects.toMatchObject({ name: "RequestTimeoutError" });
	} finally {
		await server.stop(true);
	}
});
