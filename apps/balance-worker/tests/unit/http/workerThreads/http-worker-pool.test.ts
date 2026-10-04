import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHttpWorkerPool } from "../../../../src/http/workerThreads/createHttpWorkerPool.js";
import { REPLY_FRAME } from "../../../../src/http/workerThreads/frames/replyFrame.js";
import type { HttpWorkerInit } from "../../../../src/http/workerThreads/types/httpWorkerThread.js";
import { createRingWriter } from "../../../../src/threads/ring/createRing.js";
import { createRingSignal } from "../../../../src/threads/ring/ringSignal.js";

const logger = { error() {} };
const noFatal = ({ cause }: { cause: unknown }) => {
	throw new Error(`unexpected pool failure: ${String(cause)}`);
};

async function freePort(): Promise<number> {
	const reservation = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response(),
	});
	const port = reservation.port;
	await reservation.stop(true);
	if (port === undefined) throw new Error("no port");
	return port;
}

/** Echoes what the main thread saw, so the test can check the request crossed the ring intact. */
async function echo(request: Request): Promise<Response> {
	const body = await request.text();
	const headers: Record<string, string> = {};
	request.headers.forEach((value, name) => {
		headers[name] = value;
	});
	if (new URL(request.url).pathname === "/boom") throw new Error("boom");
	return new Response(
		JSON.stringify({
			method: request.method,
			path: new URL(request.url).pathname + new URL(request.url).search,
			headers,
			bodyLength: body.length,
			bodyHead: body.slice(0, 16),
		}),
		{
			status: request.method === "POST" ? 201 : 200,
			headers: { "content-type": "application/json", "x-echo": "1" },
		},
	);
}

describe("HTTP worker pool", () => {
	let port: number;
	let listener: { stop(): Promise<void> };

	beforeAll(async () => {
		port = await freePort();
		const pool = createHttpWorkerPool({
			ctx: { fetch: echo, logger, onFatal: noFatal },
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 4 << 20,
				threads: 2,
				requestRingBytes: 4 << 20,
				replyRingBytes: 16 << 20,
			},
		});
		listener = await pool.listen();
	});

	afterAll(async () => {
		await listener.stop();
	});

	test("a POST crosses the ring with its method, path, query, headers and body, and the reply with status and headers", async () => {
		const response = await fetch(`http://127.0.0.1:${port}/v1/track?x=1`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-request-budget-ms": "900",
			},
			body: JSON.stringify({ hello: "world" }),
		});
		expect(response.status).toBe(201);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(response.headers.get("x-echo")).toBe("1");
		const seen = (await response.json()) as {
			method: string;
			path: string;
			headers: Record<string, string>;
			bodyLength: number;
			bodyHead: string;
		};
		expect(seen.method).toBe("POST");
		expect(seen.path).toBe("/v1/track?x=1");
		expect(seen.headers["content-type"]).toBe("application/json");
		expect(seen.headers["x-request-budget-ms"]).toBe("900");
		expect(seen.bodyLength).toBe(17);
		expect(seen.bodyHead).toBe('{"hello":"world"');
	});

	test("a GET health check is forwarded without a body", async () => {
		const response = await fetch(`http://127.0.0.1:${port}/health`);
		expect(response.status).toBe(200);
		const seen = (await response.json()) as {
			method: string;
			path: string;
			bodyLength: number;
		};
		expect(seen).toMatchObject({
			method: "GET",
			path: "/health",
			bodyLength: 0,
		});
	});

	test("a body too big for a ring frame still arrives, and a big reply still returns", async () => {
		const big = "x".repeat(2 << 20);
		const response = await fetch(`http://127.0.0.1:${port}/v1/initialize`, {
			method: "POST",
			body: big,
		});
		expect(response.status).toBe(201);
		expect(((await response.json()) as { bodyLength: number }).bodyLength).toBe(
			big.length,
		);
	});

	test("a handler failure answers 500 rather than hanging the connection", async () => {
		const response = await fetch(`http://127.0.0.1:${port}/boom`, {
			method: "POST",
			body: "{}",
		});
		expect(response.status).toBe(500);
	});

	test("500 concurrent requests all come back to the right caller", async () => {
		const replies = await Promise.all(
			Array.from({ length: 500 }, (_, i) =>
				fetch(`http://127.0.0.1:${port}/v1/check`, {
					method: "POST",
					body: `{"i":${i}}`,
				}).then(async (r) => ({
					status: r.status,
					bodyHead: ((await r.json()) as { bodyHead: string }).bodyHead,
					i,
				})),
			),
		);
		for (const reply of replies) {
			expect(reply.status).toBe(201);
			expect(reply.bodyHead).toBe(`{"i":${reply.i}}`);
		}
	});
});

describe("HTTP worker pool back-pressure", () => {
	test("while the main thread is stalled the request ring fills and later requests get OVERLOADED at once", async () => {
		const port = await freePort();
		const pool = createHttpWorkerPool({
			ctx: { fetch: async () => new Response("ok"), logger, onFatal: noFatal },
			// 16 KiB of requests: about 18 of these 700 B requests fill it while the decide thread is away.
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 1 << 20,
				threads: 1,
				requestRingBytes: 16384,
				replyRingBytes: 1 << 16,
			},
		});
		const listener = await pool.listen();
		try {
			// A separate thread fires the requests, because this thread is about to block.
			const client = new Worker(
				new URL("./burstClient.ts", import.meta.url).href,
			);
			const statuses = new Promise<number[]>((resolve) => {
				client.onmessage = (event: MessageEvent<number[]>) =>
					resolve(event.data);
			});
			client.postMessage({ port, count: 60, body: "y".repeat(700) });
			// Stall this thread as a long decide would; the burst lands on the HTTP worker meanwhile.
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);
			const result = await statuses;
			client.terminate();
			const overloaded = result.filter((status) => status === 429).length;
			const ok = result.filter((status) => status === 200).length;
			expect(ok).toBeGreaterThan(0);
			expect(overloaded).toBeGreaterThan(0);
			expect(ok + overloaded).toBe(60);
			expect(ok).toBeLessThanOrEqual(24);
		} finally {
			await listener.stop();
		}
	});
});

/** Spawns the pool while `Worker` is wrapped, so the test holds each thread and the init it was handed. */
async function listenWithSpiedWorkers({
	onFatal,
}: {
	onFatal: (failure: { cause: unknown }) => void;
}) {
	const port = await freePort();
	const workers: Worker[] = [];
	const inits: HttpWorkerInit[] = [];
	const RealWorker = globalThis.Worker;
	globalThis.Worker = class extends RealWorker {
		constructor(url: string | URL, options?: WorkerOptions) {
			super(url, options);
			workers.push(this);
		}
		postMessage(
			message: unknown,
			transferOrOptions?: Transferable[] | StructuredSerializeOptions,
		): void {
			if (message && typeof message === "object" && "requestRing" in message)
				inits.push(message as HttpWorkerInit);
			super.postMessage(message, transferOrOptions as Transferable[]);
		}
	} as typeof Worker;
	try {
		const pool = createHttpWorkerPool({
			ctx: { fetch: async () => new Response("ok"), logger, onFatal },
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 1 << 20,
				threads: 2,
				requestRingBytes: 1 << 16,
				replyRingBytes: 1 << 16,
			},
		});
		const listener = await pool.listen();
		return { port, workers, inits, listener };
	} finally {
		globalThis.Worker = RealWorker;
	}
}

/** Collects what the pool reports as fatal; `stop()` afterwards must not throw even with a dead worker. */
async function fatalCauses({
	run,
}: {
	run: (spied: Awaited<ReturnType<typeof listenWithSpiedWorkers>>) => void;
}): Promise<string[]> {
	const causes: string[] = [];
	const spied = await listenWithSpiedWorkers({
		onFatal: ({ cause }) => causes.push(String(cause)),
	});
	try {
		run(spied);
		const deadline = Date.now() + 2_000;
		while (causes.length === 0 && Date.now() < deadline) await Bun.sleep(10);
		await Bun.sleep(100);
		return causes;
	} finally {
		await spied.listener.stop();
	}
}

describe("HTTP worker pool failures", () => {
	test("an HTTP worker thread crashing after listen is reported once as fatal, so the task is replaced", async () => {
		const causes = await fatalCauses({
			// A message the worker cannot read throws inside its onmessage: an uncaught error on that thread.
			run: ({ workers }) => workers[1]?.postMessage(null),
		});
		expect(causes).toHaveLength(1);
		expect(causes[0]).toContain("HTTP worker 1 failed");
	});

	test("an HTTP worker thread that exits without an error is fatal too", async () => {
		const causes = await fatalCauses({
			run: ({ workers }) => workers[0]?.terminate(),
		});
		expect(causes).toHaveLength(1);
		expect(causes[0]).toContain("HTTP worker 0 exited");
	});

	test("a frame the drain loop cannot read is fatal rather than silently ending dispatch", async () => {
		const causes = await fatalCauses({
			run: ({ inits }) => {
				const init = inits[0];
				if (!init) throw new Error("no worker init captured");
				const requests = createRingWriter({
					ring: init.requestRing,
					signal: createRingSignal({ sab: init.requestSignal }),
				});
				requests.write({ type: REPLY_FRAME, payload: new Uint8Array(8) });
				requests.flush();
			},
		});
		expect(causes).toHaveLength(1);
		expect(causes[0]).toContain("unexpected frame 2");
	});
});
