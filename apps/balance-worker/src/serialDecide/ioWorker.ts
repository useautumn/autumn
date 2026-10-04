/**
 * An I/O worker: owns one `Bun.serve` on the worker's port (SO_REUSEPORT spreads connections over the
 * pool), reads each request's bytes, hands them to the main thread over its command ring and answers
 * with the bytes the main thread sends back. Under serial-decide arm D a hot route crosses as a HOT frame
 * and its reply may come back with a sequence number: the worker then holds it until the partition's
 * commit position reaches that number. Nothing here knows a route's meaning or touches balance state.
 */
import {
	FAIL_HEADER_BYTES,
	HOT_HEADER_BYTES,
	HOT_PATHS,
	HOT_RES_HEADER_BYTES,
	type HotKind,
} from "./hotProtocol.js";
import {
	FRAME,
	forwardableHeaders,
	type IoWorkerInit,
	LANE_STAT,
	type MainMessage,
	REQ_HEADER_BYTES,
	RES_HEADER_BYTES,
	type RequestMeta,
	type ResponseMeta,
	RING_FULL_BODY,
} from "./ioProtocol.js";
import { Doorbell, RingConsumer, RingProducer } from "./ring.js";

declare var self: Worker;

const JSON_HEADERS = { "content-type": "application/json" };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Pending = { resolve(response: Response): void };
type Held = Pending & { seq: number; response: Response };

let started = false;

self.onmessage = (event: MessageEvent<IoWorkerInit | MainMessage>) => {
	const message = event.data;
	if ("kind" in message) {
		onMainMessage(message);
		return;
	}
	if (started) return;
	started = true;
	start(message);
};

let onMainMessage: (message: MainMessage) => void = () => undefined;

/** The hot kind of a request, or undefined when it takes the classic path: not a hot route, or not JSON. */
function hotKindOf({
	request,
	path,
}: {
	request: Request;
	path: string;
}): HotKind | undefined {
	if (request.method !== "POST") return undefined;
	const query = path.indexOf("?");
	const kind = HOT_PATHS[query === -1 ? path : path.slice(0, query)];
	if (kind === undefined) return undefined;
	const contentType = request.headers.get("content-type");
	if (contentType?.split(";")[0]?.trim().toLowerCase() !== "application/json")
		return undefined;
	return kind;
}

/** The request's budget header, read by the client contract's rule (1 to 9 digits); 0 when absent or malformed. */
function budgetMsOf({ request }: { request: Request }): number {
	const value = request.headers.get("x-request-budget-ms")?.trim();
	if (value === undefined || !/^\d{1,9}$/.test(value)) return 0;
	return Number(value);
}

function start(init: IoWorkerInit): void {
	const commands = new RingProducer(
		init.commandRing,
		new Doorbell(init.commandBell),
	);
	const results = new RingConsumer(init.resultRing);
	const resultBell = new Doorbell(init.resultBell);
	const pending = new Map<number, Pending>();
	let nextReqId = 1;
	const stats = new Float64Array(init.stats);
	const hot = init.hot && {
		positions: new BigInt64Array(init.hot.cells),
		/** Per partition, the replies held for its commit position, in seq order. */
		held: Array.from({ length: init.hot.partitionCount }, () => [] as Held[]),
		/** The partitions holding at least one reply. */
		holding: new Set<number>(),
	};
	// Bodies near the ring's size go by postMessage; the ring is for the hot, small requests.
	const oversizedThreshold = Math.min(
		init.commandRing.capacity >>> 3,
		256 * 1024,
	);

	function take({ reqId }: { reqId: number }): Pending | undefined {
		const waiting = pending.get(reqId);
		if (!waiting) return undefined;
		pending.delete(reqId);
		stats[LANE_STAT.pending] = pending.size;
		return waiting;
	}

	function respond({
		reqId,
		status,
		meta,
		body,
	}: {
		reqId: number;
		status: number;
		meta: ResponseMeta;
		body: Uint8Array | ArrayBuffer;
	}): void {
		take({ reqId })?.resolve(new Response(body, { status, headers: meta.h }));
	}

	/** Where a held reply with a seq above `seq` starts in a queue kept in seq order. */
	function indexAbove({ queue, seq }: { queue: Held[]; seq: number }): number {
		let at = queue.length;
		while (at > 0 && queue[at - 1].seq > seq) at--;
		return at;
	}

	function queueOf({ partition }: { partition: number }): Held[] {
		const queue = hot?.held[partition];
		if (!queue)
			throw new Error(
				`I/O worker ${init.index}: partition ${partition} has no commit position`,
			);
		return queue;
	}

	/** Holds a reply until its partition's commit position reaches `seq`, or answers it now when it already has. */
	function hold({
		reqId,
		status,
		meta,
		body,
		partition,
		seq,
	}: {
		reqId: number;
		status: number;
		meta: ResponseMeta;
		body: Uint8Array | ArrayBuffer;
		partition: number;
		seq: number;
	}): void {
		const queue = queueOf({ partition });
		const waiting = take({ reqId });
		if (!waiting) return;
		const response = new Response(body, { status, headers: meta.h });
		// Replies of a partition arrive in seq order; only a promised outcome can land behind a later one.
		queue.splice(indexAbove({ queue, seq }), 0, {
			seq,
			resolve: waiting.resolve,
			response,
		});
		hot?.holding.add(partition);
		stats[LANE_STAT.hotHeld]++;
		stats[LANE_STAT.held]++;
	}

	function positionOf({ partition }: { partition: number }): number {
		if (!hot) return 0;
		return Number(Atomics.load(hot.positions, partition));
	}

	function releasable(): boolean {
		if (!hot) return false;
		for (const partition of hot.holding) {
			const head = hot.held[partition]?.[0];
			if (head && positionOf({ partition }) >= head.seq) return true;
		}
		return false;
	}

	/** Answers, in seq order, every held reply whose partition's commit position has reached it. */
	function releaseHeld(): void {
		if (!hot) return;
		for (const partition of hot.holding) {
			const queue = queueOf({ partition });
			const position = positionOf({ partition });
			let n = 0;
			for (const entry of queue) {
				if (entry.seq > position) break;
				entry.resolve(entry.response);
				n++;
			}
			if (n === 0) continue;
			queue.splice(0, n);
			stats[LANE_STAT.hotReleased] += n;
			stats[LANE_STAT.held] -= n;
			if (queue.length === 0) hot.holding.delete(partition);
		}
	}

	/** Answers every held reply of the partition in (`aboveSeq`, `lastSeq`] with the failure; the rest wait for the position. */
	function failAbove({
		partition,
		aboveSeq,
		lastSeq,
		status,
		body,
	}: {
		partition: number;
		aboveSeq: number;
		lastSeq: number;
		status: number;
		body: string;
	}): void {
		const queue = queueOf({ partition });
		const from = indexAbove({ queue, seq: aboveSeq });
		const to = indexAbove({ queue, seq: lastSeq });
		const failed = queue.splice(from, to - from);
		for (const entry of failed)
			entry.resolve(new Response(body, { status, headers: JSON_HEADERS }));
		stats[LANE_STAT.hotFailed] += failed.length;
		stats[LANE_STAT.held] -= failed.length;
		if (queue.length === 0) hot?.holding.delete(partition);
	}

	function drainResults(): number {
		let n = 0;
		for (;;) {
			const frame = results.next();
			if (!frame) break;
			const view = results.payloadView;
			switch (frame.type) {
				case FRAME.RES: {
					const reqId = view.getUint32(frame.offset, true);
					const status = view.getUint16(frame.offset + 4, true);
					const metaLength = view.getUint32(frame.offset + 6, true);
					const meta = JSON.parse(
						decoder.decode(
							frame.bytes.subarray(
								RES_HEADER_BYTES,
								RES_HEADER_BYTES + metaLength,
							),
						),
					) as ResponseMeta;
					// A copy: the ring slot is reused as soon as we advance.
					const body = frame.bytes.slice(RES_HEADER_BYTES + metaLength);
					results.advance();
					n++;
					respond({ reqId, status, meta, body });
					break;
				}
				case FRAME.HOT_RES: {
					const reqId = view.getUint32(frame.offset, true);
					const status = view.getUint16(frame.offset + 4, true);
					const partition = view.getUint16(frame.offset + 6, true);
					const seq = view.getFloat64(frame.offset + 8, true);
					const metaLength = view.getUint32(frame.offset + 16, true);
					const meta = JSON.parse(
						decoder.decode(
							frame.bytes.subarray(
								HOT_RES_HEADER_BYTES,
								HOT_RES_HEADER_BYTES + metaLength,
							),
						),
					) as ResponseMeta;
					const body = frame.bytes.slice(HOT_RES_HEADER_BYTES + metaLength);
					results.advance();
					n++;
					if (seq > 0) hold({ reqId, status, meta, body, partition, seq });
					else respond({ reqId, status, meta, body });
					break;
				}
				case FRAME.FAIL: {
					const partition = view.getUint16(frame.offset, true);
					const aboveSeq = view.getFloat64(frame.offset + 2, true);
					const lastSeq = view.getFloat64(frame.offset + 10, true);
					const status = view.getUint16(frame.offset + 18, true);
					const body = decoder.decode(frame.bytes.subarray(FAIL_HEADER_BYTES));
					results.advance();
					n++;
					failAbove({ partition, aboveSeq, lastSeq, status, body });
					break;
				}
				default:
					throw new Error(
						`I/O worker ${init.index}: unexpected frame ${frame.type}`,
					);
			}
		}
		if (n > 0) results.release();
		return n;
	}

	async function resultLoop(): Promise<void> {
		for (;;) {
			drainResults();
			releaseHeld();
			stats[LANE_STAT.wakes]++;
			// A commit position moving between the release above and the sleep shows in `hasWork` or rings the
			// bell; the short timeout while holding is only insurance against a wake lost some other way.
			await resultBell.sleep({
				hasWork: () => results.hasWork() || releasable(),
				timeoutMs: hot?.holding.size ? 10 : 50,
			});
		}
	}

	async function forward(request: Request): Promise<Response> {
		const url = request.url;
		const pathStart = url.indexOf("/", url.indexOf("//") + 2);
		const meta: RequestMeta = {
			m: request.method,
			u: pathStart === -1 ? "/" : url.slice(pathStart),
			h: forwardableHeaders(request.headers),
		};
		const kind = hot ? hotKindOf({ request, path: meta.u }) : undefined;
		const body = new Uint8Array(await request.arrayBuffer());
		const metaText = JSON.stringify(meta);
		const reqId = nextReqId++;
		if (nextReqId === 0xffffffff) nextReqId = 1;
		const { promise, resolve } = Promise.withResolvers<Response>();
		const headerBytes =
			kind === undefined ? REQ_HEADER_BYTES : HOT_HEADER_BYTES;
		const maxLength = headerBytes + metaText.length * 3 + body.length;
		if (maxLength > oversizedThreshold) {
			stats[LANE_STAT.oversized]++;
			pending.set(reqId, { resolve });
			stats[LANE_STAT.pending] = pending.size;
			postMessage({ kind: "request", reqId, meta, body: body.buffer }, [
				body.buffer,
			]);
			return promise;
		}
		const at = commands.claim({
			type: kind === undefined ? FRAME.REQ : FRAME.HOT,
			maxLength,
		});
		if (at < 0) {
			stats[LANE_STAT.ringFull]++;
			return new Response(RING_FULL_BODY, {
				status: 429,
				headers: JSON_HEADERS,
			});
		}
		const view = commands.payloadView;
		view.setUint32(at, reqId, true);
		if (kind !== undefined) {
			const budgetMs = budgetMsOf({ request });
			view.setUint8(at + 4, kind);
			view.setUint32(at + 5, budgetMs, true);
			view.setFloat64(at + 9, budgetMs > 0 ? Date.now() + budgetMs : 0, true);
			stats[LANE_STAT.hot]++;
		}
		const { written } = encoder.encodeInto(
			metaText,
			commands.payload.subarray(at + headerBytes, at + maxLength - body.length),
		);
		view.setUint32(at + headerBytes - 4, written, true);
		commands.payload.set(body, at + headerBytes + written);
		commands.publish({ length: headerBytes + written + body.length });
		stats[LANE_STAT.requests]++;
		pending.set(reqId, { resolve });
		stats[LANE_STAT.pending] = pending.size;
		commands.flush();
		return promise;
	}

	let server: ReturnType<typeof Bun.serve>;
	try {
		server = Bun.serve({
			hostname: init.hostname,
			port: init.port,
			reusePort: true,
			idleTimeout: 0,
			maxRequestBodySize: init.maxRequestBodySize,
			fetch: forward,
		});
	} catch (cause) {
		postMessage({
			kind: "error",
			index: init.index,
			message: String((cause as Error)?.message ?? cause),
		});
		return;
	}

	onMainMessage = (message) => {
		if (message.kind === "response") {
			respond({
				reqId: message.reqId,
				status: message.status,
				meta: message.meta,
				body: message.body,
			});
			return;
		}
		if (message.kind === "stop") {
			void server
				.stop(true)
				.then(() => postMessage({ kind: "stopped", index: init.index }));
		}
	};

	void resultLoop();
	postMessage({ kind: "ready", index: init.index, port: server.port });
}
