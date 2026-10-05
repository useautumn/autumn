import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHttpWorkerPool } from "../../../../src/http/workerThreads/createHttpWorkerPool.js";
import type { HttpWorkerListener } from "../../../../src/http/workerThreads/types/httpWorkerPool.js";
import type { InlineReply } from "../../../../src/http/workerThreads/types/inlineHandler.js";

const logger = { error() {} };
const noFatal = ({ cause }: { cause: unknown }) => {
	throw new Error(`unexpected pool failure: ${String(cause)}`);
};
const PARTITIONS = 4;
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

/** The request body names the reply: `{ partition, seq, pad?, fallback? }`. */
function handler({
	body,
}: {
	route: number;
	body: Uint8Array;
}): InlineReply | null {
	const asked = JSON.parse(decoder.decode(body)) as {
		partition: number;
		seq: number;
		pad?: number;
		fallback?: boolean;
	};
	if (asked.fallback) return null;
	return {
		status: 200,
		body: JSON.stringify({ seq: asked.seq, pad: "x".repeat(asked.pad ?? 0) }),
		partition: asked.partition,
		heldUntilSeq: asked.seq,
	};
}

type Answer = { status: number; seq?: number; code?: string; via?: string };

/** Settles with the answer, or "pending" if none arrives within `ms`. */
async function within(
	answer: Promise<Answer>,
	ms: number,
): Promise<Answer | "pending"> {
	const timer = Bun.sleep(ms).then(() => "pending" as const);
	return Promise.race([answer, timer]);
}

async function answerOf(response: Promise<Response>): Promise<Answer> {
	const reply = await response;
	const json = (await reply.json()) as {
		seq?: number;
		via?: string;
		error?: { code: string };
	};
	return {
		status: reply.status,
		...(json.seq !== undefined && { seq: json.seq }),
		...(json.error && { code: json.error.code }),
		...(json.via && { via: json.via }),
	};
}

describe("HTTP worker pool: replies held by commit position", () => {
	let port: number;
	let listener: HttpWorkerListener;
	const cells = new SharedArrayBuffer(PARTITIONS * 8);
	const failureCounts = new SharedArrayBuffer(PARTITIONS * 4);
	const positions = new BigInt64Array(cells);
	const failures = new Int32Array(failureCounts);

	function commit({ partition, seq }: { partition: number; seq: number }) {
		Atomics.store(positions, partition, BigInt(seq));
		listener.commitPositionMoved({ partition, seq });
	}

	function fail({
		partition,
		aboveSeq,
		lastSeq,
	}: {
		partition: number;
		aboveSeq: number;
		lastSeq: number;
	}) {
		Atomics.add(failures, partition, 1);
		listener.failHeld({
			partition,
			aboveSeq,
			lastSeq,
			status: 503,
			body: JSON.stringify({ error: { code: "NOT_READY", message: "x" } }),
		});
	}

	function post(body: object, path = "/v1/inline"): Promise<Answer> {
		return answerOf(
			fetch(`http://127.0.0.1:${port}${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);
	}

	beforeAll(async () => {
		port = await freePort();
		const pool = createHttpWorkerPool({
			ctx: {
				fetch: async () => new Response(JSON.stringify({ via: "fetch" })),
				logger,
				onFatal: noFatal,
			},
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 4 << 20,
				threads: 2,
				requestRingBytes: 1 << 16,
				replyRingBytes: 1 << 16,
				inline: {
					routes: ["/v1/inline"],
					handler,
					commitCells: cells,
					failureCounts,
				},
			},
		});
		listener = await pool.listen();
	});

	afterAll(async () => {
		await listener.stop();
	});

	test("a held reply goes out only once its partition's commit position reaches it, in sequence order", async () => {
		const second = post({ partition: 0, seq: 2 });
		const first = post({ partition: 0, seq: 1 });
		expect(await within(first, 100)).toBe("pending");
		commit({ partition: 0, seq: 1 });
		expect(await within(first, 1000)).toEqual({ status: 200, seq: 1 });
		expect(await within(second, 100)).toBe("pending");
		commit({ partition: 0, seq: 2 });
		expect(await within(second, 1000)).toEqual({ status: 200, seq: 2 });
	});

	test("a reply already passed by the position, a seq of 0, other routes and a declined request go out at once", async () => {
		expect(await within(post({ partition: 0, seq: 2 }), 1000)).toEqual({
			status: 200,
			seq: 2,
		});
		expect(await within(post({ partition: 1, seq: 0 }), 1000)).toEqual({
			status: 200,
			seq: 0,
		});
		expect(await post({ partition: 0, seq: 9 }, "/v1/other")).toEqual({
			status: 200,
			via: "fetch",
		});
		expect(await post({ partition: 0, seq: 9, fallback: true })).toEqual({
			status: 200,
			via: "fetch",
		});
	});

	test("a failure answers exactly the held replies in its range; the rest keep waiting for the position", async () => {
		const below = post({ partition: 2, seq: 3 });
		const inRange = post({ partition: 2, seq: 5 });
		const above = post({ partition: 2, seq: 8 });
		await Bun.sleep(50);
		fail({ partition: 2, aboveSeq: 4, lastSeq: 6 });
		expect(await within(inRange, 1000)).toEqual({
			status: 503,
			code: "NOT_READY",
		});
		expect(await within(below, 100)).toBe("pending");
		commit({ partition: 2, seq: 8 });
		expect(await within(below, 1000)).toEqual({ status: 200, seq: 3 });
		expect(await within(above, 1000)).toEqual({ status: 200, seq: 8 });
	});

	test("a position that has passed a reply does not release it while a published failure is still on its way", async () => {
		const held = post({ partition: 3, seq: 4 });
		await Bun.sleep(50);
		// The writer counts the failure before its frame is queued; the cell can move in between.
		Atomics.add(failures, 3, 1);
		Atomics.store(positions, 3, 4n);
		listener.commitPositionMoved({ partition: 3, seq: 4 });
		expect(await within(held, 150)).toBe("pending");
		listener.failHeld({
			partition: 3,
			aboveSeq: 3,
			lastSeq: 4,
			status: 503,
			body: JSON.stringify({ error: { code: "NOT_READY", message: "x" } }),
		});
		expect(await within(held, 1000)).toEqual({
			status: 503,
			code: "NOT_READY",
		});
	});

	test("a held reply too big for the ring waits on the decide thread, released by position or failed by range", async () => {
		const released = post({ partition: 1, seq: 10, pad: 20_000 });
		const failed = post({ partition: 1, seq: 12, pad: 20_000 });
		expect(await within(released, 100)).toBe("pending");
		commit({ partition: 1, seq: 10 });
		expect(await within(released, 1000)).toEqual({ status: 200, seq: 10 });
		fail({ partition: 1, aboveSeq: 10, lastSeq: 12 });
		expect(await within(failed, 1000)).toEqual({
			status: 503,
			code: "NOT_READY",
		});
	});
});

test("a pool without inline routes holds nothing, so a published failure is ignored and it keeps serving", async () => {
	const port = await freePort();
	const fatal: unknown[] = [];
	const listener = await createHttpWorkerPool({
		ctx: {
			fetch: async () => new Response(JSON.stringify({ via: "fetch" })),
			logger,
			onFatal: ({ cause }) => fatal.push(cause),
		},
		config: {
			hostname: "127.0.0.1",
			port,
			maxRequestBodySize: 1 << 20,
			threads: 1,
			requestRingBytes: 1 << 16,
			replyRingBytes: 1 << 16,
		},
	}).listen();
	try {
		listener.failHeld({
			partition: 0,
			aboveSeq: 0,
			lastSeq: 1,
			status: 503,
			body: "{}",
		});
		const answer = await answerOf(
			fetch(`http://127.0.0.1:${port}/v1/track`, {
				method: "POST",
				body: "{}",
			}),
		);
		expect(answer).toEqual({ status: 200, via: "fetch" });
		expect(fatal).toEqual([]);
	} finally {
		await listener.stop();
	}
});
