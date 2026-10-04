/**
 * I/O worker: owns a `Bun.serve` on the shared port (SO_REUSEPORT), parses nothing but the HTTP
 * envelope, hands the request bytes to the sequencer over its command ring, and answers from the
 * result ring once the record's seq is at or below the commit position. Everything here scales
 * with cores; nothing here touches balance state.
 */
import {
	CELL_COMMIT,
	CELL_FAILED_FROM,
	CELL_FAILED_TO,
	CMD_HEADER,
	FRAME,
	type IoWorkerInit,
	KIND,
	RES_HEADER,
} from "./protocol.ts";
import { pinFromEnv, threadId } from "./pin.ts";
import { Doorbell, RingConsumer, RingProducer } from "./ring.ts";

declare var self: Worker;

const JSON_HEADERS = { "content-type": "application/json" };
const OVERLOADED = new TextEncoder().encode(
	JSON.stringify({ error: { code: "OVERLOADED", message: "Command ring full" } }),
);
const NOT_COMMITTED = new TextEncoder().encode(
	JSON.stringify({ error: { code: "NOT_COMMITTED", message: "Batch did not commit" } }),
);

type Pending = { resolve(response: Response): void; startedAt: number; path: string };

self.onmessage = (event: MessageEvent) => {
	const init = event.data as IoWorkerInit;
	start(init);
};

function start(init: IoWorkerInit): void {
	const cpus = pinFromEnv({ role: "io", index: init.index });
	const commands = new RingProducer(init.commandRing, new Doorbell(init.sequencerBell));
	const results = new RingConsumer(init.resultRing);
	const resultBell = new Doorbell(init.resultBell);
	const cells = new Int32Array(init.cells);
	const encoder = new TextEncoder();
	const pending = new Map<number, Pending>();
	// Replies decided but not yet durable, in seq order (the sequencer assigns seqs monotonically).
	const held: { reqId: number; seq: number; status: number; body: Uint8Array }[] = [];
	let nextReqId = 1;
	const stats = { requests: 0, overloaded: 0, held: 0, released: 0, wakes: 0, failed: 0, logged: 0 };

	function pathOf(url: string): string {
		const start = url.indexOf("/", url.indexOf("//") + 2);
		if (start === -1) return "/";
		const query = url.indexOf("?", start);
		return query === -1 ? url.slice(start) : url.slice(start, query);
	}

	function respond({
		reqId,
		status,
		body,
	}: {
		reqId: number;
		status: number;
		body: Uint8Array;
	}): void {
		const waiting = pending.get(reqId);
		if (!waiting) return;
		pending.delete(reqId);
		waiting.resolve(new Response(body, { status, headers: JSON_HEADERS }));
		if (init.logRate > 0 && Math.random() < init.logRate) {
			stats.logged++;
			// The production fast path samples a structured log line per request; the cost lands here, not on the sequencer.
			console.error(
				JSON.stringify({
					level: "info",
					msg: "balance_worker.request",
					path: waiting.path,
					status,
					durationMs: Number((performance.now() - waiting.startedAt).toFixed(3)),
					io: init.index,
				}),
			);
		}
	}

	function releaseHeld(): void {
		const commitPos = Atomics.load(cells, CELL_COMMIT) >>> 0;
		let n = 0;
		while (n < held.length && (held[n] as { seq: number }).seq <= commitPos) n++;
		for (let i = 0; i < n; i++) {
			const entry = held[i] as (typeof held)[number];
			respond({ reqId: entry.reqId, status: entry.status, body: entry.body });
			stats.released++;
		}
		if (n > 0) held.splice(0, n);
		const failedFrom = Atomics.load(cells, CELL_FAILED_FROM) >>> 0;
		if (failedFrom === 0) return;
		const failedTo = Atomics.load(cells, CELL_FAILED_TO) >>> 0;
		for (let i = held.length - 1; i >= 0; i--) {
			const entry = held[i] as (typeof held)[number];
			if (entry.seq < failedFrom || entry.seq > failedTo) continue;
			respond({ reqId: entry.reqId, status: 503, body: NOT_COMMITTED });
			held.splice(i, 1);
			stats.failed++;
		}
	}

	function drainResults(): number {
		let n = 0;
		const commitPos = Atomics.load(cells, CELL_COMMIT) >>> 0;
		for (;;) {
			const frame = results.next();
			if (!frame) break;
			if (frame.type !== FRAME.RES) throw new Error(`io: unexpected frame ${frame.type}`);
			const view = results.payloadView;
			const reqId = view.getUint32(frame.offset, true);
			const seq = view.getUint32(frame.offset + 4, true);
			const status = view.getUint16(frame.offset + 8, true);
			// Copy out: the ring slot is reused as soon as we advance.
			const body = frame.bytes.slice(RES_HEADER);
			results.advance();
			n++;
			if (seq === 0 || seq <= commitPos) respond({ reqId, status, body });
			else {
				held.push({ reqId, seq, status, body });
				stats.held++;
			}
		}
		if (n > 0) results.release();
		return n;
	}

	async function resultLoop(): Promise<void> {
		for (;;) {
			drainResults();
			releaseHeld();
			stats.wakes++;
			await resultBell.sleep({
				hasWork: () =>
					results.hasWork() ||
					(held.length > 0 && (held[0] as { seq: number }).seq <= (Atomics.load(cells, CELL_COMMIT) >>> 0)),
				timeoutMs: 20,
			});
		}
	}

	async function receive(request: Request, path: string): Promise<Response> {
		const kind = path === "/v1/track" ? KIND.TRACK : KIND.CHECK;
		const body = await request.text();
		const budgetHeader = request.headers.get("x-request-budget-ms");
		const budgetMs = budgetHeader ? Number(budgetHeader) | 0 : 0;
		const reqId = nextReqId++;
		if (nextReqId === 0xffffffff) nextReqId = 1;
		const maxLength = CMD_HEADER + body.length * 3;
		const at = commands.claim({ type: FRAME.CMD, maxLength });
		if (at < 0) {
			stats.overloaded++;
			return new Response(OVERLOADED, { status: 503, headers: JSON_HEADERS });
		}
		const view = commands.payloadView;
		view.setUint32(at, reqId, true);
		commands.payload[at + 4] = kind;
		view.setUint32(at + 5, budgetMs, true);
		const { written } = encoder.encodeInto(body, commands.payload.subarray(at + CMD_HEADER, at + maxLength));
		commands.publish({ length: CMD_HEADER + written });
		stats.requests++;
		const { promise, resolve } = Promise.withResolvers<Response>();
		pending.set(reqId, { resolve, startedAt: performance.now(), path });
		commands.flush();
		return promise;
	}

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: init.port,
		reusePort: true,
		idleTimeout: 0,
		maxRequestBodySize: 1_000_000,
		fetch(request) {
			if (request.method !== "POST") return new Response("not found", { status: 404 });
			const path = pathOf(request.url);
			if (path !== "/v1/track" && path !== "/v1/check")
				return new Response("not found", { status: 404 });
			return receive(request, path);
		},
	});
	void resultLoop();
	postMessage({ ready: true, role: "io", index: init.index, tid: threadId(), cpus, port: server.port });
	setInterval(() => postMessage({ stats: { ...stats, pending: pending.size, heldNow: held.length } }), 5000).unref();
}
