import { afterEach, expect, test } from "bun:test";
import { AutumnCore } from "../src/core.js";
import { check } from "../src/funcs/check.js";
import { Autumn } from "../src/sdk/sdk.js";

// An operation that rejects outright (mid-body timeout, malformed 200) must reject
// into the caller only, never also surface as an unhandledRejection.

const unhandled: string[] = [];
const listener = (reason: unknown) => {
	unhandled.push(reason instanceof Error ? reason.name : String(reason));
};
process.on("unhandledRejection", listener);

afterEach(() => {
	unhandled.length = 0;
});

const drainTicks = () => new Promise((resolve) => setTimeout(resolve, 50));

test("timeout aborting the body read rejects into the caller only", async () => {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch() {
			// Headers and a partial body arrive, then the stream stalls past
			// the client timeout, so the abort lands mid response.text().
			return new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('{"allowed":'));
					},
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		},
	});
	try {
		const client = new Autumn({
			secretKey: "test",
			serverURL: `http://127.0.0.1:${server.port}`,
			timeoutMs: 250,
			retryConfig: { strategy: "none" },
		});

		let caught: unknown;
		try {
			await client.check({ customerId: "customer_123", featureId: "messages" });
		} catch (error) {
			caught = error;
		}
		await drainTicks();

		expect((caught as Error).name).toBe("TimeoutError");
		expect(unhandled).toEqual([]);
	} finally {
		server.stop(true);
	}
});

test("malformed JSON on a 200 rejects into the caller only", async () => {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch() {
			return new Response("this is not json", {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
	});
	try {
		const client = new Autumn({
			secretKey: "test",
			serverURL: `http://127.0.0.1:${server.port}`,
			retryConfig: { strategy: "none" },
		});

		let caught: unknown;
		try {
			await client.check({ customerId: "customer_123", featureId: "messages" });
		} catch (error) {
			caught = error;
		}
		await drainTicks();

		expect(caught).toBeInstanceOf(SyntaxError);
		expect(unhandled).toEqual([]);
	} finally {
		server.stop(true);
	}
});

test(".catch() on the APIPromise still receives the rejection", async () => {
	// The fix pre-attaches a noop handler to #unwrapped; a user handler
	// attached through the class's own .catch() must still fire.
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch() {
			return new Response("this is not json", {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
	});
	try {
		const client = new AutumnCore({
			secretKey: "test",
			serverURL: `http://127.0.0.1:${server.port}`,
			retryConfig: { strategy: "none" },
		});

		const caught = await check(client, {
			customerId: "customer_123",
			featureId: "messages",
		}).catch((error: unknown) => error);
		await drainTicks();

		expect(caught).toBeInstanceOf(SyntaxError);
		expect(unhandled).toEqual([]);
	} finally {
		server.stop(true);
	}
});
