import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	PartitionWriterCapacityError,
	PartitionWriterDisposedError,
} from "../../../src/processor/writer/writerErrors.js";
import { createIoWorkerPool } from "../../../src/serialDecide/createIoWorkerPool.js";
import {
	HOT_KIND,
	type HotDecider,
	type HotOutcome,
	type HotRequest,
} from "../../../src/serialDecide/hotProtocol.js";
import { createPositionBoard } from "../../../src/serialDecide/positionBoard.js";

const logger = { info() {}, warn() {}, error() {} };
const noFatal = ({ cause }: { cause: unknown }) => {
	throw new Error(`unexpected pool failure: ${String(cause)}`);
};
const decoder = new TextDecoder();

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

type Echo = {
	method: string;
	path: string;
	headers: Record<string, string>;
	bodyLength: number;
	bodyHead: string;
};

/** Echoes what the main thread saw, so the test can check a fallback crossed the ring intact. */
async function echo(request: Request): Promise<Response> {
	const body = await request.text();
	const headers: Record<string, string> = {};
	request.headers.forEach((value, name) => {
		headers[name] = value;
	});
	return new Response(
		JSON.stringify({
			method: request.method,
			path: new URL(request.url).pathname + new URL(request.url).search,
			headers,
			bodyLength: body.length,
			bodyHead: body.slice(0, 16),
		} satisfies Echo),
		{
			status: request.method === "POST" ? 201 : 200,
			headers: { "content-type": "application/json", "x-echo": "1" },
		},
	);
}

/** What a request body asks the fake decider to do. */
type Script = {
	partition?: number;
	seq?: number;
	status?: number;
	headers?: [string, string][];
	null?: true;
	throw?: true;
	pad?: string;
	/** Pads the decided body to this many bytes. */
	replyBytes?: number;
};

type Decided = {
	decided: true;
	kind: number;
	partition: number;
	seq: number;
	budgetMs: number | null;
	pad?: string;
};

function fakeDecider({
	partitionCount,
}: {
	partitionCount: number;
}): HotDecider & { calls: HotRequest[] } {
	const calls: HotRequest[] = [];
	return {
		partitionCount,
		calls,
		decide(request) {
			calls.push(request);
			const script = JSON.parse(decoder.decode(request.body)) as Script;
			if (script.null) return null;
			if (script.throw) throw new Error("decider boom");
			return {
				status: script.status ?? 200,
				headers: script.headers,
				body: JSON.stringify({
					decided: true,
					kind: request.kind,
					partition: script.partition ?? 0,
					seq: script.seq ?? 0,
					budgetMs: request.budgetMs ?? null,
					...(script.replyBytes && { pad: "y".repeat(script.replyBytes) }),
				} satisfies Decided),
				partition: script.partition ?? 0,
				seq: script.seq ?? 0,
			} satisfies HotOutcome;
		},
	};
}

/** A fetch's settlement, readable without awaiting it (a held reply must stay unsettled for a while). */
function watch(promise: Promise<Response>): {
	settled: boolean;
	response?: Response;
} {
	const box: { settled: boolean; response?: Response } = { settled: false };
	promise.then(
		(response) => {
			box.settled = true;
			box.response = response;
		},
		() => {
			box.settled = true;
		},
	);
	return box;
}

async function until(predicate: () => boolean, what: string): Promise<void> {
	const deadline = Date.now() + 2_000;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await Bun.sleep(5);
	}
}

function laneTotal(
	pool: ReturnType<typeof createIoWorkerPool>,
	counter: string,
): number {
	let total = 0;
	for (const [lane, counters] of Object.entries(pool.readStats()))
		if (lane.startsWith("io")) total += counters[counter] ?? 0;
	return total;
}

describe("I/O worker pool hot path", () => {
	let port: number;
	let listener: { stop(): Promise<void> };
	let pool: ReturnType<typeof createIoWorkerPool>;
	const board = createPositionBoard({ config: { partitionCount: 4 } });
	const decider = fakeDecider({ partitionCount: 4 });

	beforeAll(async () => {
		port = await freePort();
		pool = createIoWorkerPool({
			ctx: {
				fetch: echo,
				logger,
				onFatal: noFatal,
				hot: { decider, positions: board },
			},
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 4 << 20,
				workers: 2,
			},
		});
		listener = await pool.listen();
	});

	afterAll(async () => {
		await listener.stop();
	});

	function post({
		script,
		path = "/v1/track",
		headers = {},
	}: {
		script: Script;
		path?: string;
		headers?: Record<string, string>;
	}): Promise<Response> {
		return fetch(`http://127.0.0.1:${port}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", ...headers },
			body: JSON.stringify(script),
		});
	}

	test("a reply with seq 0 is answered at once with the decider's status, body, json content-type and headers", async () => {
		const response = await post({
			script: { partition: 1, seq: 0, status: 202, headers: [["x-hot", "1"]] },
		});
		expect(response.status).toBe(202);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(response.headers.get("x-hot")).toBe("1");
		expect((await response.json()) as Decided).toMatchObject({
			decided: true,
			kind: HOT_KIND.TRACK,
			partition: 1,
			seq: 0,
		});
	});

	test("a check crosses as its own kind and its reply goes out at once", async () => {
		const before = decider.calls.length;
		const response = await post({
			script: { partition: 1, seq: 0, status: 200 },
			path: "/v1/check",
		});
		expect(response.status).toBe(200);
		expect((await response.json()) as Decided).toMatchObject({
			decided: true,
			kind: HOT_KIND.CHECK,
		});
		expect(decider.calls[before]?.kind).toBe(HOT_KIND.CHECK);
	});

	test("a decider that throws answers 500 like a fetch failure", async () => {
		const thrown = await post({ script: { throw: true } });
		expect(thrown.status).toBe(500);
	});

	test("a reply with seq > 0 is held until the partition's position reaches it", async () => {
		const held = watch(post({ script: { partition: 1, seq: 7 } }));
		await until(() => laneTotal(pool, "held") === 1, "the reply to be held");
		await Bun.sleep(100);
		expect(held.settled).toBe(false);
		board.sinkFor({ partition: 1 }).committed({ seq: 6 });
		await Bun.sleep(50);
		expect(held.settled).toBe(false);
		board.sinkFor({ partition: 1 }).committed({ seq: 7 });
		await until(() => held.settled, "the reply to be released");
		const response = held.response as Response;
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect((await response.json()) as Decided).toMatchObject({
			partition: 1,
			seq: 7,
		});
		expect(laneTotal(pool, "held")).toBe(0);
	});

	test("held replies on one partition are released in seq order as the position advances in steps", async () => {
		const replies = [1, 2, 3].map((seq) =>
			watch(post({ script: { partition: 2, seq } })),
		);
		await until(() => laneTotal(pool, "held") === 3, "three held replies");
		const sink = board.sinkFor({ partition: 2 });
		for (const seq of [1, 2, 3]) {
			sink.committed({ seq });
			await until(() => replies[seq - 1].settled, `seq ${seq} to be released`);
			await Bun.sleep(20);
			expect(replies.map((reply) => reply.settled)).toEqual(
				[1, 2, 3].map((other) => other <= seq),
			);
		}
		for (const [index, reply] of replies.entries())
			expect(
				(await (reply.response as Response).json()) as Decided,
			).toMatchObject({ partition: 2, seq: index + 1 });
	});

	test("a failure above a position answers the held replies in its range and keeps the rest for the position", async () => {
		const replies = [1, 2, 3, 4].map((seq) =>
			watch(post({ script: { partition: 3, seq } })),
		);
		await until(() => laneTotal(pool, "held") === 4, "four held replies");
		board.sinkFor({ partition: 3 }).failedAbove({
			seq: 2,
			lastSeq: 4,
			cause: new PartitionWriterCapacityError(),
		});
		await until(
			() => replies[2].settled && replies[3].settled,
			"seq 3 and 4 to be failed",
		);
		for (const failed of [replies[2], replies[3]]) {
			const response = failed.response as Response;
			expect(response.status).toBe(429);
			expect(response.headers.get("content-type")).toBe("application/json");
			expect(await response.json()).toEqual({
				error: {
					code: "OVERLOADED",
					message:
						"Partition is at capacity for this customer; retry with backoff",
				},
			});
		}
		await Bun.sleep(50);
		expect(replies[0].settled).toBe(false);
		expect(replies[1].settled).toBe(false);
		expect(laneTotal(pool, "held")).toBe(2);
		// A reply decided after the failure is held on the position like any other, not failed retroactively.
		const later = watch(post({ script: { partition: 3, seq: 3 } }));
		await until(() => laneTotal(pool, "held") === 3, "the later reply held");
		board.sinkFor({ partition: 3 }).committed({ seq: 3 });
		await until(
			() => replies[0].settled && later.settled,
			"seq 1, 2 and the later 3 to be released",
		);
		for (const reply of [replies[0], replies[1], later])
			expect((reply.response as Response).status).toBe(200);
		expect(laneTotal(pool, "held")).toBe(0);
	});

	test("a reply too big for the result ring is held on the main thread, released by the position and failed by a range covering it", async () => {
		const heldHere = () => pool.readStats().main.hotHeldHere;
		const before = heldHere();
		const held = watch(
			post({ script: { partition: 1, seq: 8, replyBytes: 3 << 20 } }),
		);
		await until(() => heldHere() === before + 1, "the big reply held here");
		await Bun.sleep(50);
		expect(held.settled).toBe(false);
		expect(laneTotal(pool, "held")).toBe(0);
		board.sinkFor({ partition: 1 }).committed({ seq: 8 });
		await until(() => held.settled, "the big reply released");
		const response = held.response as Response;
		expect(response.status).toBe(200);
		expect(((await response.json()) as Decided).pad).toHaveLength(3 << 20);
		// A big reply and a ring-sized one on the same partition: one failure answers both, nothing is held elsewhere.
		const big = watch(
			post({ script: { partition: 1, seq: 10, replyBytes: 3 << 20 } }),
		);
		const small = watch(post({ script: { partition: 1, seq: 9 } }));
		await until(
			() => heldHere() === before + 2 && laneTotal(pool, "held") === 1,
			"both replies held",
		);
		board.sinkFor({ partition: 1 }).failedAbove({
			seq: 8,
			lastSeq: 10,
			cause: new PartitionWriterCapacityError(),
		});
		await until(() => big.settled && small.settled, "both replies failed");
		expect((big.response as Response).status).toBe(429);
		expect((small.response as Response).status).toBe(429);
		expect(await (big.response as Response).json()).toEqual(
			await (small.response as Response).json(),
		);
		expect(laneTotal(pool, "held")).toBe(0);
	});

	test("a rebuilt writer numbers from above its predecessor, and its first held reply waits for its own commit", async () => {
		const first = board.sinkFor({ partition: 1 });
		// The predecessor committed up to 500 and left; the cell keeps 500.
		while (first.nextSeq() < 500);
		first.committed({ seq: 500 });
		first.closed({ lastSeq: 500, cause: new PartitionWriterDisposedError() });
		const second = board.sinkFor({ partition: 1 });
		expect(second.open()).toEqual({ commitPos: 500, lastSeq: 500 });
		const seq = second.nextSeq();
		expect(seq).toBe(501);
		const held = watch(post({ script: { partition: 1, seq } }));
		await until(
			() => laneTotal(pool, "held") === 1,
			"the successor's reply held",
		);
		await Bun.sleep(200);
		expect(held.settled).toBe(false);
		second.committed({ seq });
		await until(() => held.settled, "the successor's reply released");
		expect((held.response as Response).status).toBe(200);
	});

	test("a position that overtakes a FAIL still in the ring releases nothing until the FAIL has been read", async () => {
		// The main thread counts a failure in shared memory before its FAIL frames queue; a frame stuck behind a
		// full ring is simulated by counting without a frame, and the count is taken back once the point is made.
		const failures = new Int32Array(board.failGenerations);
		const sink = board.sinkFor({ partition: 3 });
		sink.committed({ seq: 20 });
		const held = watch(post({ script: { partition: 3, seq: 21 } }));
		await until(() => laneTotal(pool, "held") === 1, "the reply held");
		Atomics.add(failures, 3, 1);
		sink.committed({ seq: 21 });
		await Bun.sleep(200);
		expect(held.settled).toBe(false);
		Atomics.sub(failures, 3, 1);
		await until(
			() => held.settled,
			"the reply released once no FAIL is pending",
		);
		expect((held.response as Response).status).toBe(200);
		// A real failure counts and frames together, so the lane catches up and keeps releasing.
		const next = watch(post({ script: { partition: 3, seq: 23 } }));
		await until(() => laneTotal(pool, "held") === 1, "the next reply held");
		sink.failedAbove({
			seq: 21,
			lastSeq: 22,
			cause: new PartitionWriterCapacityError(),
		});
		sink.committed({ seq: 23 });
		await until(() => next.settled, "the next reply released after the FAIL");
		expect((next.response as Response).status).toBe(200);
		expect(laneTotal(pool, "held")).toBe(0);
	});

	test("a writer that goes away fails what it held above the position and leaves its successor's replies held", async () => {
		const gone = board.sinkFor({ partition: 2 });
		gone.committed({ seq: 10 });
		const orphans = [11, 12].map((seq) =>
			watch(post({ script: { partition: 2, seq } })),
		);
		await until(() => laneTotal(pool, "held") === 2, "the orphans held");
		gone.closed({ lastSeq: 12, cause: new PartitionWriterDisposedError() });
		await until(
			() => orphans.every((orphan) => orphan.settled),
			"the orphans answered",
		);
		for (const orphan of orphans) {
			const response = orphan.response as Response;
			expect(response.status).toBe(503);
			expect(await response.json()).toEqual({
				error: {
					code: "NOT_READY",
					message:
						"Partition owner stopped before this command was acknowledged; it may have landed, retry",
				},
			});
		}
		const successor = watch(post({ script: { partition: 2, seq: 13 } }));
		await until(
			() => laneTotal(pool, "held") === 1,
			"the successor's reply held",
		);
		// A late close of the old writer covers only its own numbers.
		gone.closed({ lastSeq: 12, cause: new PartitionWriterDisposedError() });
		await Bun.sleep(100);
		expect(successor.settled).toBe(false);
		board.sinkFor({ partition: 2 }).committed({ seq: 13 });
		await until(() => successor.settled, "the successor's reply released");
		expect((successor.response as Response).status).toBe(200);
		expect(laneTotal(pool, "held")).toBe(0);
	});

	test("a request the decider declines reaches fetch with the method, path, headers and body of a classic request", async () => {
		const headers = { "x-request-budget-ms": "900", "x-custom": "a" };
		const before = decider.calls.length;
		const fallback = await post({
			script: { null: true },
			path: "/v1/track?x=1",
			headers,
		});
		const classic = await post({
			script: { null: true },
			path: "/v1/other?x=1",
			headers,
		});
		expect(fallback.status).toBe(201);
		expect(fallback.headers.get("x-echo")).toBe("1");
		const seenFallback = (await fallback.json()) as Echo;
		const seenClassic = (await classic.json()) as Echo;
		expect(seenFallback).toEqual({ ...seenClassic, path: "/v1/track?x=1" });
		expect(seenFallback).toMatchObject({
			method: "POST",
			bodyHead: '{"null":true}',
			bodyLength: 13,
		});
		expect(seenFallback.headers).toMatchObject({
			"content-type": "application/json",
			"x-request-budget-ms": "900",
			"x-custom": "a",
		});
		expect(decider.calls.length).toBe(before + 1);
		const request = decider.calls[before];
		expect(request.kind).toBe(HOT_KIND.TRACK);
		expect(request.budgetMs).toBe(900);
		expect(request.deadlineAt).toBeGreaterThan(Date.now() - 5_000);
		expect(request.deadlineAt).toBeLessThanOrEqual(Date.now() + 900);
	});

	test("a body too big for the ring takes the classic path without a hot attempt", async () => {
		const before = decider.calls.length;
		const response = await post({
			script: { null: true, pad: "x".repeat(300_000) },
		});
		expect(response.status).toBe(201);
		expect(((await response.json()) as Echo).bodyLength).toBeGreaterThan(
			300_000,
		);
		expect(decider.calls.length).toBe(before);
	});

	test("other routes, methods and content types never reach the decider", async () => {
		const before = decider.calls.length;
		const health = await fetch(`http://127.0.0.1:${port}/health`);
		expect(health.status).toBe(200);
		expect((await health.json()) as Echo).toMatchObject({
			method: "GET",
			path: "/health",
		});
		const other = await post({
			script: { partition: 1, seq: 9 },
			path: "/v1/other",
		});
		expect(other.status).toBe(201);
		expect((await other.json()) as Echo).toMatchObject({ path: "/v1/other" });
		const text = await fetch(`http://127.0.0.1:${port}/v1/track`, {
			method: "POST",
			headers: { "content-type": "text/plain" },
			body: "partition=1",
		});
		expect(text.status).toBe(201);
		expect((await text.json()) as Echo).toMatchObject({
			bodyHead: "partition=1",
		});
		expect(decider.calls.length).toBe(before);
	});

	test("hot counters move on the main thread and on the lanes", () => {
		const stats = pool.readStats();
		expect(stats.main).toMatchObject({
			hot: decider.calls.length,
			hotFallback: 1,
			hotErrors: 1,
			hotFailed: 6,
			hotHeldHere: 2,
		});
		expect(laneTotal(pool, "hot")).toBe(decider.calls.length);
		expect(laneTotal(pool, "hotHeld")).toBeGreaterThanOrEqual(12);
		expect(laneTotal(pool, "hotFailed")).toBe(5);
		expect(laneTotal(pool, "hotReleased")).toBe(
			laneTotal(pool, "hotHeld") - laneTotal(pool, "hotFailed"),
		);
		expect(laneTotal(pool, "held")).toBe(0);
		expect(laneTotal(pool, "requests")).toBeGreaterThanOrEqual(
			decider.calls.length + 4,
		);
	});
});

describe("I/O worker pool hot path on one lane", () => {
	test("one position jump releases every held reply up to it in seq order", async () => {
		const port = await freePort();
		const board = createPositionBoard({ config: { partitionCount: 1 } });
		const decider = fakeDecider({ partitionCount: 1 });
		const pool = createIoWorkerPool({
			ctx: {
				fetch: echo,
				logger,
				onFatal: noFatal,
				hot: { decider, positions: board },
			},
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 1 << 20,
				workers: 1,
			},
		});
		const listener = await pool.listen();
		try {
			const released: number[] = [];
			const replies = [1, 2, 3, 4].map((seq) =>
				fetch(`http://127.0.0.1:${port}/v1/track`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ partition: 0, seq } satisfies Script),
				}).then((response) => {
					released.push(seq);
					return response;
				}),
			);
			await until(() => laneTotal(pool, "held") === 4, "four held replies");
			board.sinkFor({ partition: 0 }).committed({ seq: 3 });
			await until(() => released.length === 3, "three releases");
			expect(released).toEqual([1, 2, 3]);
			await Bun.sleep(50);
			expect(released).toHaveLength(3);
			board.sinkFor({ partition: 0 }).committed({ seq: 4 });
			await until(() => released.length === 4, "the last release");
			expect(released).toEqual([1, 2, 3, 4]);
			for (const [index, reply] of (await Promise.all(replies)).entries())
				expect((await reply.json()) as Decided).toMatchObject({
					seq: index + 1,
				});
		} finally {
			await listener.stop();
		}
	});
});

describe("I/O worker pool hot path failures", () => {
	test("a reply for a partition without a commit position is fatal rather than held forever", async () => {
		const port = await freePort();
		const causes: string[] = [];
		const pool = createIoWorkerPool({
			ctx: {
				fetch: echo,
				logger,
				onFatal: ({ cause }) => causes.push(String(cause)),
				hot: {
					decider: fakeDecider({ partitionCount: 2 }),
					positions: createPositionBoard({ config: { partitionCount: 2 } }),
				},
			},
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 1 << 20,
				workers: 1,
			},
		});
		const listener = await pool.listen();
		try {
			// The task is replaced on fatal, which is what ends this connection; the pool owes only the report.
			watch(
				fetch(`http://127.0.0.1:${port}/v1/track`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ partition: 9, seq: 1 } satisfies Script),
				}),
			);
			await until(() => causes.length > 0, "the pool to fail");
			await Bun.sleep(100);
			expect(causes).toHaveLength(1);
			expect(causes[0]).toContain("I/O worker 0 failed");
			expect(causes[0]).toContain("partition 9 has no commit position");
		} finally {
			await listener.stop();
		}
	});
});
